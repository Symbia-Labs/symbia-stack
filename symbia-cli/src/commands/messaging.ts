import { Command } from 'commander';
import { messaging } from '../client.js';
import { success, error, output, detail, info } from '../output.js';

interface Conversation {
  id: string;
  name?: string;
  type: 'private' | 'group';
  createdAt: string;
  updatedAt: string;
}

interface Message {
  id: string;
  senderId: string;
  senderType: string;
  content: string;
  contentType: string;
  createdAt: string;
}

interface Participant {
  id: string;
  userId: string;
  userType: string;
  role: string;
  joinedAt: string;
}

export function registerMessagingCommands(program: Command): void {
  const msg = program
    .command('messaging')
    .alias('msg')
    .description('Real-time messaging');

  // Conversations
  const conversations = msg
    .command('conversations')
    .alias('convos')
    .description('Manage conversations');

  conversations
    .command('list')
    .description('List conversations')
    .option('-l, --limit <n>', 'Maximum results', '20')
    .action(async (opts) => {
      const res = await messaging.get<{ conversations: Conversation[] }>('/api/conversations', {
        limit: parseInt(opts.limit, 10),
      });

      if (!res.ok) {
        error(res.error || 'Failed to list conversations');
        process.exit(1);
      }

      output(res.data?.conversations || [], {
        columns: [
          { key: 'id', header: 'ID' },
          { key: 'name', header: 'Name' },
          { key: 'type', header: 'Type' },
          { key: 'updatedAt', header: 'Last Activity' },
        ],
        idKey: 'id',
      });
    });

  conversations
    .command('create <name>')
    .description('Create a conversation')
    .option('-t, --type <type>', 'Conversation type (private, group)', 'group')
    .action(async (name, opts) => {
      const res = await messaging.post<Conversation>('/api/conversations', {
        name,
        type: opts.type,
      });

      if (!res.ok) {
        error(res.error || 'Failed to create conversation');
        process.exit(1);
      }

      success(`Created conversation: ${res.data?.name || res.data?.id}`);
      detail('ID', res.data?.id);
    });

  conversations
    .command('get <id>')
    .description('Get conversation details')
    .action(async (id) => {
      const res = await messaging.get<Conversation>(`/api/conversations/${id}`);

      if (!res.ok) {
        error(res.error || 'Conversation not found');
        process.exit(1);
      }

      const conv = res.data!;
      detail('ID', conv.id);
      detail('Name', conv.name);
      detail('Type', conv.type);
      detail('Created', conv.createdAt);
      detail('Updated', conv.updatedAt);
    });

  conversations
    .command('delete <id>')
    .description('Delete a conversation')
    .option('-f, --force', 'Skip confirmation')
    .action(async (id, opts) => {
      if (!opts.force) {
        error('Use --force to confirm deletion');
        process.exit(1);
      }

      const res = await messaging.delete(`/api/conversations/${id}`);

      if (!res.ok) {
        error(res.error || 'Failed to delete conversation');
        process.exit(1);
      }

      success(`Deleted conversation: ${id}`);
    });

  // Messages
  const messages = msg
    .command('messages')
    .description('Manage messages');

  messages
    .command('list <conversationId>')
    .description('List messages in a conversation')
    .option('-l, --limit <n>', 'Maximum messages', '50')
    .action(async (conversationId, opts) => {
      const res = await messaging.get<{ messages: Message[] }>(
        `/api/conversations/${conversationId}/messages`,
        { limit: parseInt(opts.limit, 10) }
      );

      if (!res.ok) {
        error(res.error || 'Failed to list messages');
        process.exit(1);
      }

      const msgs = res.data?.messages || [];

      if (msgs.length === 0) {
        info('No messages');
        return;
      }

      msgs.forEach(msg => {
        const time = new Date(msg.createdAt).toLocaleString();
        const sender = `${msg.senderType}:${msg.senderId}`;
        console.log(`[${time}] ${sender}: ${msg.content}`);
      });
    });

  messages
    .command('send <conversationId> <content>')
    .description('Send a message')
    .option('-t, --type <type>', 'Content type', 'text')
    .action(async (conversationId, content, opts) => {
      const res = await messaging.post<Message>(`/api/conversations/${conversationId}/messages`, {
        content,
        contentType: opts.type,
      });

      if (!res.ok) {
        error(res.error || 'Failed to send message');
        process.exit(1);
      }

      success('Message sent');
    });

  // Participants
  const participants = msg
    .command('participants')
    .description('Manage conversation participants');

  participants
    .command('list <conversationId>')
    .description('List participants')
    .action(async (conversationId) => {
      const res = await messaging.get<{ participants: Participant[] }>(
        `/api/conversations/${conversationId}/participants`
      );

      if (!res.ok) {
        error(res.error || 'Failed to list participants');
        process.exit(1);
      }

      output(res.data?.participants || [], {
        columns: [
          { key: 'userId', header: 'User ID' },
          { key: 'userType', header: 'Type' },
          { key: 'role', header: 'Role' },
          { key: 'joinedAt', header: 'Joined' },
        ],
      });
    });

  participants
    .command('add <conversationId> <userId>')
    .description('Add a participant')
    .option('-t, --type <type>', 'User type (user, agent)', 'user')
    .option('-r, --role <role>', 'Role (owner, admin, member)', 'member')
    .action(async (conversationId, userId, opts) => {
      const res = await messaging.post(`/api/conversations/${conversationId}/participants`, {
        userId,
        userType: opts.type,
        role: opts.role,
      });

      if (!res.ok) {
        error(res.error || 'Failed to add participant');
        process.exit(1);
      }

      success(`Added ${userId} to conversation`);
    });

  participants
    .command('remove <conversationId> <userId>')
    .description('Remove a participant')
    .action(async (conversationId, userId) => {
      const res = await messaging.delete(`/api/conversations/${conversationId}/participants/${userId}`);

      if (!res.ok) {
        error(res.error || 'Failed to remove participant');
        process.exit(1);
      }

      success(`Removed ${userId} from conversation`);
    });
}
