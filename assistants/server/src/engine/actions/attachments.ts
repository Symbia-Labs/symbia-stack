/**
 * What arrived with the message, rendered for the prompt.
 *
 * The operator's words stay exactly the operator's words. Anything attached —
 * which panel they were looking at, a region they captured with the spyglass —
 * is appended as a labelled block after them, never woven into them. A message
 * the user did not write, presented as the message they wrote, is a small lie
 * that makes every downstream trace wrong.
 *
 * WHY THIS EXISTS AT ALL. The default prompt template is `{{message.content}}`,
 * so an assistant sees the typed words and nothing else. The console has been
 * attaching context and captured frames for a day; carrying that metadata
 * through the webhook was necessary and not sufficient, because no template
 * referenced it. Measured 7 Aug 2026: an operator captured a frame, sent
 * "sending the spycap to the arena", and the assistant replied that it did not
 * know what they were referring to — while the description of the captured
 * region sat in the message metadata, unread.
 *
 * THE ARENA IS LOAD-BEARING. A REFUSED frame is stated as a refusal, in the
 * prompt, with an explicit instruction not to describe what it might have
 * shown. An assistant that receives "no model looked at this" and answers as
 * though one had is producing exactly the confident-answer-standing-on-nothing
 * this platform exists to prevent, and it must not be able to claim it was
 * unclear.
 */
import type { ExecutionContext } from '../types.js';

interface FrameAttachment {
  digest?: string;
  width?: number;
  height?: number;
  nodeId?: string;
  capturedAt?: string;
  arena?: string;
  verdict?: string | null;
  provider?: string | null;
  model?: string | null;
  path?: string;
}

interface SituationAttachment {
  panel?: string;
  situation?: string;
}

export function buildAttachmentBlock(context: ExecutionContext, template: string): string {
  const meta = (context.message?.metadata ?? {}) as Record<string, unknown>;
  const frame = meta.symbiaFrame as FrameAttachment | undefined;
  const situation = meta.symbiaContext as SituationAttachment | undefined;

  const parts: string[] = [];

  // If the ruleset already renders these, do not render them twice. A template
  // that has been written to place them deliberately knows better than this.
  const mentionsFrame = /symbiaFrame/.test(template);
  const mentionsSituation = /symbiaContext/.test(template);

  if (situation?.situation && !mentionsSituation) {
    parts.push(`WHERE THE OPERATOR IS\n${situation.situation}`);
  }

  if (frame?.digest && !mentionsFrame) {
    const lines: string[] = [];
    lines.push('ATTACHED SCREEN CAPTURE');
    lines.push(
      `The operator framed a region of their screen with the spyglass and attached it ` +
        `to this message. Frame ${frame.digest}` +
        (frame.width && frame.height ? ` (${frame.width}x${frame.height})` : '') +
        (frame.nodeId ? `, captured by ${frame.nodeId}` : '') +
        '.'
    );

    if (frame.arena === 'COMPOSED' && frame.verdict) {
      lines.push(
        `A vision model looked at it${frame.model ? ` (${frame.model}` : ''}` +
          `${frame.model && frame.path ? ` via ${frame.path}` : ''}${frame.model ? ')' : ''} ` +
          `and described it as follows. This description is the ONLY information you ` +
          `have about the image; you cannot see the image itself.`
      );
      lines.push(`"${frame.verdict}"`);
    } else {
      // The refusal, stated as one, with the consequence spelled out. Leaving
      // this implicit invites a plausible guess, which is the failure mode.
      lines.push(
        `NO MODEL LOOKED AT THIS IMAGE. ${frame.verdict ?? 'The vision request was refused.'}`
      );
      lines.push(
        `You therefore have NO information about what the capture shows. Do not ` +
          `describe it, guess at it, or answer as though you had seen it. Say that ` +
          `the capture could not be read and, if useful, why.`
      );
    }

    parts.push(lines.join('\n'));
  }

  if (parts.length === 0) return '';

  return `\n\n---\n${parts.join('\n\n')}\n---\n`;
}
