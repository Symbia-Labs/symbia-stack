import os, re, glob
def read(f):
    try: return open(f,encoding="utf-8",errors="ignore").read()
    except: return ""
def norm(p):
    if not p: return "/"
    p=re.sub(r':([A-Za-z0-9_]+)',r'{\1}',p); p=re.sub(r'\{[A-Za-z0-9_]+\}','{}',p)
    p=re.sub(r'/+','/',p)
    if len(p)>1 and p.endswith('/'): p=p[:-1]
    return p
ROUTE_RE=re.compile(r'\b([A-Za-z_$][\w$]*)\.(get|post|put|patch|delete)\(\s*[`\'"](/[^`\'"]*)[`\'"]')
USE_RE=re.compile(r'\.use\(\s*[\'"]([^\'"]+)[\'"]\s*,\s*([A-Za-z0-9_$]+)')
IMPORT_RE=re.compile(r'import\s+(?:\{([^}]+)\}|([A-Za-z0-9_]+))\s+from\s+[\'"]([^\'"]+)[\'"]')
APP_RECV={"app","fastify","server"}          # absolute-path receivers
def is_router_recv(name, routervars):
    if name in APP_RECV: return False
    if name in routervars: return True
    if name in ("router","api","apiRouter","r"): return True
    if name.lower().endswith("router") or name.lower().endswith("routes"): return True
    return False
def router_vars(text):
    vs=set()
    for m in re.finditer(r'(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:express\.)?Router\s*\(',text): vs.add(m.group(1))
    for m in re.finditer(r'([A-Za-z_$][\w$]*)\s*:\s*Router\b',text): vs.add(m.group(1))
    return vs
ARR_RE=re.compile(r'\b([A-Za-z_$][\w$]*)\.(get|post|put|patch|delete)\(\s*\[([^\]]+)\]')
def collect(text):
    """return list of (METHOD, path, kind) kind in {'app','router'}"""
    rv=router_vars(text); out=[]
    for m in ROUTE_RE.finditer(text):
        recv=m.group(1)
        if recv in APP_RECV: out.append((m.group(2).upper(), m.group(3), 'app'))
        elif is_router_recv(recv, rv): out.append((m.group(2).upper(), m.group(3), 'router'))
    for m in ARR_RE.finditer(text):
        recv=m.group(1)
        if recv not in APP_RECV and not is_router_recv(recv, rv): continue
        kind='app' if recv in APP_RECV else 'router'
        for pm in re.finditer(r'[`\'"](/[^`\'"]*)[`\'"]', m.group(3)):
            out.append((m.group(2).upper(), pm.group(1), kind))
    return out
def resolve_import(from_file,spec):
    if not spec.startswith("."): return None
    spec=re.sub(r'\.jsx?$','',spec)
    base=os.path.normpath(os.path.join(os.path.dirname(from_file),spec))
    for c in (base+".ts",base+".tsx",os.path.join(base,"index.ts"),os.path.join(base,"routes.ts")):
        if os.path.exists(c): return c
    return None
class Svc:
    def __init__(self,srcdir):
        self.files=[f for f in glob.glob(os.path.join(srcdir,"**","*.ts"),recursive=True) if "node_modules" not in f and not f.endswith(".d.ts")]
        self.routes={}; self.imports={}; self.symdef={}; self.mounts={}
        for f in self.files:
            t=read(f); self.imports[f]={}
            for m in IMPORT_RE.finditer(t):
                ns=[]
                if m.group(1): ns=[x.strip().split(" as ")[-1].strip() for x in m.group(1).split(",") if x.strip()]
                if m.group(2): ns=[m.group(2).strip()]
                tgt=resolve_import(f,m.group(3))
                for n in ns: self.imports[f][n]=tgt
            self.routes[f]=collect(t)
            for m in re.finditer(r'(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)',t): self.symdef.setdefault(m.group(1),f)
            for m in re.finditer(r'(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=',t): self.symdef.setdefault(m.group(1),f)
        for f in self.files:
            t=read(f); ml=[]
            for m in USE_RE.finditer(t):
                prefix,ident=m.group(1),m.group(2)
                tgt=self.symdef.get(ident) or self.imports.get(f,{}).get(ident)
                if tgt: ml.append((prefix,tgt))
            self.mounts[f]=ml
    def expand_router(self,f,prefix,stack,acc):
        if f in stack or len(stack)>12: return
        stack=stack|{f}
        for meth,rp,kind in self.routes.get(f,[]):
            if kind=='router':
                full=prefix+("" if rp=="/" else rp); acc.add((meth,norm(full)))
        for sub,tgt in self.mounts.get(f,[]):
            self.expand_router(tgt, norm(prefix+sub), stack, acc)
    def all_routes(self):
        acc=set()
        for m in ("GET",):
            for p in ("/health","/health/live","/health/ready","/openapi.json","/.well-known/openapi.json","/docs/openapi.json"):
                acc.add((m,p))
        # absolute app-level routes from every file
        for f in self.files:
            for meth,rp,kind in self.routes[f]:
                if kind=='app': acc.add((meth,norm(rp)))
        # mounted routers (prefix + relative)
        for f in self.files:
            for prefix,tgt in self.mounts[f]:
                self.expand_router(tgt, norm(prefix), set(), acc)
        return acc

# ---- runner: validate each service's OpenAPI spec against implemented routes ----
if __name__=="__main__":
    import json, sys
    ROOT=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    SERVICES=["identity","logging","catalog","assistants","messaging","runtime","integrations","models","network"]
    METHODS=("get","post","put","patch","delete")
    def base_path(spec):
        s=spec.get("servers",[])
        if not s: return ""
        u=s[0].get("url","")
        m=re.match(r'https?://[^/]+(/.*)?$',u)
        return (m.group(1) or "").rstrip("/") if m else u.rstrip("/")
    def is_infra(p):
        if p in ("/","/health","/health/ready","/health/live","/metrics","/openapi.json","/favicon.ico","/symbia-namespace","/api/docs"): return True
        return p.startswith("/docs") or p.startswith("/.well-known") or "llms" in p or p=="/llm.txt" or p.endswith("/openapi.json")
    total_missing=0
    for svc in SERVICES:
        spec=json.load(open(os.path.join(ROOT,svc,"docs","openapi.json")))
        bp=base_path(spec); adv=set()
        for path,item in spec.get("paths",{}).items():
            for meth in item:
                if meth.lower() in METHODS: adv.add((meth.upper(),norm(bp+path)))
        impl=Svc(os.path.join(ROOT,svc,"server","src")).all_routes()
        missing=sorted([(m,p) for (m,p) in adv if (m,p) not in impl])
        undoc=sorted([(m,p) for (m,p) in impl if (m,p) not in adv and not is_infra(p) and "/internal" not in p and "/debug" not in p])
        total_missing+=len(missing)
        print(f"\n== {svc} (advertised={len(adv)} implemented={len(impl)}) ==")
        print(f"  advertised-but-NOT-implemented: {len(missing)}")
        for m,p in missing: print(f"     ! {m:6} {p}")
        print(f"  implemented-but-undocumented: {len(undoc)}")
        for m,p in undoc: print(f"       {m:6} {p}")
    print(f"\nTOTAL advertised-but-missing (spec promises a route that does not exist): {total_missing}")
    sys.exit(1 if total_missing else 0)
