export const CLAUDE_EVENT_HOOK_TEMPLATE = `import sys,json,os,time
from pathlib import Path
try:
 d=json.load(sys.stdin)
except:
 sys.exit(0)
sid=os.environ.get("CLAUDE_IDE_SESSION_ID","")
if not sid:
 raw_sid=d.get("session_id","")
 if isinstance(raw_sid,str):
  sid=raw_sid
if not sid:
 sys.exit(0)
status_dir=r'__CALDER_STATUS_DIR__'
def _provider_sync_path(session_id):
 return Path(status_dir)/f"{session_id}.provider_sync.json"
def _load_provider_sync(session_id):
 path=_provider_sync_path(session_id)
 payload={}
 if path.is_file():
  try:
   loaded=json.loads(path.read_text())
   if isinstance(loaded,dict):
    payload=loaded
  except:
   payload={}
 provider=payload.get("main_provider_family") or payload.get("main_provider") or ""
 provider=provider.lower() if isinstance(provider,str) else ""
 model=payload.get("main_model_exact") or ""
 model=model if isinstance(model,str) else ""
 raw_active=payload.get("active_subagent_ids")
 active_ids=[]
 if isinstance(raw_active,list):
  for value in raw_active:
   text=str(value).strip()
   if text and text not in active_ids:
    active_ids.append(text)
 pending=payload.get("pending_subagent_launches",0)
 if not isinstance(pending,int) or pending<0:
  pending=0
 return path,provider,model,active_ids,pending
def _detect_provider_from_model(model_name):
 text=model_name.strip().lower() if isinstance(model_name,str) else ""
 if not text:
  return ""
 if text.startswith("glm-"):
  return "zai"
 if text.startswith("minimax-"):
  return "minimax"
 if text.startswith("qwen"):
  return "qwen"
 if text in ("haiku","sonnet","opus") or text.startswith("claude-"):
  return "anthropic"
 return ""
def _event_model_candidates(payload):
 candidates=[]
 def _push(value):
  if isinstance(value,str):
   normalized=value.strip()
   if normalized and normalized not in candidates:
    candidates.append(normalized)
 for key in ("model","resolved_model","main_model_exact"):
  _push(payload.get(key,""))
 metadata=payload.get("metadata")
 if isinstance(metadata,dict):
  for key in ("model","main_model_exact"):
   _push(metadata.get(key,""))
 tool_input=payload.get("tool_input")
 if isinstance(tool_input,dict):
  for key in ("model","resolved_model"):
   _push(tool_input.get(key,""))
 return candidates
def _configured_model_candidate():
 settings_paths=[]
 explicit=os.environ.get("CLAUDE_SETTINGS_PATH","").strip()
 if explicit:
  settings_paths.append(explicit)
 settings_paths.append(os.path.expanduser("~/.claude/settings.json"))
 for settings_path in settings_paths:
  try:
   with open(settings_path,"r",encoding="utf-8") as handle:
    payload=json.load(handle)
  except:
   continue
  if isinstance(payload,dict):
   model_value=payload.get("model","")
   if isinstance(model_value,str) and model_value.strip():
    return model_value.strip()
 return ""
def _write_provider_sync(path,provider,model,active_ids,pending):
 payload={
  "main_provider_family":provider if provider else None,
  "main_model_exact":model,
  "active_subagent_ids":active_ids,
  "pending_subagent_launches":pending if isinstance(pending,int) and pending>=0 else 0,
  "updated_at_ms":int(time.time()*1000),
 }
 tmp_path=path.with_suffix(path.suffix+".tmp")
 try:
  path.parent.mkdir(parents=True,exist_ok=True)
  tmp_path.write_text(json.dumps(payload,ensure_ascii=False,separators=(",",":")))
  tmp_path.replace(path)
 except:
  try:
   if tmp_path.exists():
    tmp_path.unlink()
  except:
   pass
def _session_main_provider(session_id):
 try:
  _,provider,_,_,_=_load_provider_sync(session_id)
  return provider
 except:
  return ""
def _resolve_main_provider_and_model(session_id,payload):
 path,provider,model,active_ids,pending=_load_provider_sync(session_id)
 candidates=[]
 candidates.extend(_event_model_candidates(payload))
 configured_model=_configured_model_candidate()
 if configured_model and configured_model not in candidates:
  candidates.append(configured_model)
 if model and model not in candidates:
  candidates.append(model)
 inferred_provider=provider
 inferred_model=model
 for candidate in candidates:
  detected=_detect_provider_from_model(candidate)
  if detected:
   inferred_provider=detected
   inferred_model=candidate
   break
 if not inferred_provider and inferred_model:
  inferred_provider=_detect_provider_from_model(inferred_model)
 if provider!=inferred_provider or model!=inferred_model:
  _write_provider_sync(path,inferred_provider,inferred_model,active_ids,pending)
 return inferred_provider,inferred_model
def _mark_subagent_launch_started(session_id):
 path,provider,model,active_ids,pending=_load_provider_sync(session_id)
 _write_provider_sync(path,provider,model,active_ids,pending+1)
def _mark_subagent_launch_finished(session_id):
 path,provider,model,active_ids,pending=_load_provider_sync(session_id)
 _write_provider_sync(path,provider,model,active_ids,max(pending-1,0))
def _mark_subagent_started(session_id,agent_id):
 path,provider,model,active_ids,pending=_load_provider_sync(session_id)
 normalized=str(agent_id).strip()
 if normalized and normalized not in active_ids:
  active_ids.append(normalized)
 _write_provider_sync(path,provider,model,sorted(active_ids),max(pending-1,0))
def _mark_subagent_stopped(session_id,agent_id):
 path,provider,model,active_ids,pending=_load_provider_sync(session_id)
 normalized=str(agent_id).strip()
 if normalized:
  active_ids=[value for value in active_ids if value!=normalized]
 elif active_ids:
  active_ids=active_ids[:-1]
 _write_provider_sync(path,provider,model,sorted(active_ids),pending)
def _clear_subagent_state(session_id):
 path,provider,model,_,_=_load_provider_sync(session_id)
 _write_provider_sync(path,provider,model,[],0)
cs=d.get("cost",{})
cw=d.get("context_window",{})
e={"type":"__CALDER_EVENT_TYPE__","timestamp":int(time.time()*1000),"hookEvent":"__CALDER_HOOK_EVENT__"}
tn=d.get("tool_name","")
if tn:
 e["tool_name"]=tn
ti=d.get("tool_input")
if ti:
 e["tool_input"]=ti
er=d.get("error","")
if er:
 e["error"]=er
for fld in ("agent_id","agent_type","last_assistant_message","agent_transcript_path","message","task_id","worktree_path","cwd","file_path","config_key","question","answer"):
 v=d.get(fld,"")
 if v:
  e[fld]=v
if cs:
 e["cost_snapshot"]={k:cs[k] for k in ("total_cost_usd","total_duration_ms") if k in cs}
if cw:
 cu=cw.get("current_usage") if isinstance(cw.get("current_usage"),dict) else None
 if cu:
  tt=(cu.get("input_tokens",0) or 0)+(cu.get("cache_creation_input_tokens",0) or 0)+(cu.get("cache_read_input_tokens",0) or 0)
 else:
  tt=(cw.get("total_input_tokens",0) or 0)+(cw.get("total_output_tokens",0) or 0)
 e["context_snapshot"]={
  "total_tokens":tt,
  "context_window_size":cw.get("context_window_size",200000),
  "used_percentage":cw.get("used_percentage",0)
 }
if tn and "__CALDER_HOOK_EVENT__"=="PostToolUse":
 import random,string as st
 tr=d.get("tool_result","") or d.get("tool_response","")
 fe=tr if isinstance(tr,str) else json.dumps(tr) if tr else ""
 if fe:
  sfx="".join(random.choices(st.ascii_lowercase,k=6))
  json.dump({"tool_name":tn,"tool_input":d.get("tool_input",{}),"error":fe},open(os.path.join(status_dir,sid+"-"+sfx+".toolfailure"),"w"))
with open(os.path.join(status_dir,sid+".events"),"a") as f:
 f.write(json.dumps(e)+"\\n")
if "__CALDER_HOOK_EVENT__"=="SubagentStart":
 _mark_subagent_started(sid,d.get("agent_id",""))
elif "__CALDER_HOOK_EVENT__"=="SubagentStop":
 _mark_subagent_stopped(sid,d.get("agent_id",""))
elif "__CALDER_HOOK_EVENT__"=="PostToolUseFailure" and tn=="Task":
 _mark_subagent_launch_finished(sid)
elif "__CALDER_HOOK_EVENT__"=="SessionEnd":
 _clear_subagent_state(sid)
if "__CALDER_HOOK_EVENT__"=="PreToolUse":
 if tn=="Task":
  _mark_subagent_launch_started(sid)
 provider,_=_resolve_main_provider_and_model(sid,d)
 is_zai_search_tool = tn in ("mcp__web-search-prime__web_search_prime","mcp__web-search-prime__webSearchPrime")
 is_minimax_search_tool = (tn.endswith("__web_search") and ("__MiniMax__" in tn or "__minimax__" in tn))
 if provider in ("zai","minimax") and tn=="WebSearch":
  allowed_hint = "mcp__MiniMax__web_search"
  print(json.dumps({
   "hookSpecificOutput":{
    "hookEventName":"PreToolUse",
    "permissionDecision":"deny",
    "permissionDecisionReason":f"WebSearch is disabled for {provider} sessions to avoid consuming Claude web-search quota. Use {allowed_hint} instead."
   }
  }))
 elif provider=="zai" and is_minimax_search_tool:
  print(json.dumps({
   "hookSpecificOutput":{
    "hookEventName":"PreToolUse",
    "permissionDecision":"allow",
    "permissionDecisionReason":"Allowing MiniMax web_search MCP tool for zai session."
   }
  }))
 elif provider=="zai" and is_zai_search_tool:
  print(json.dumps({
   "hookSpecificOutput":{
    "hookEventName":"PreToolUse",
    "permissionDecision":"deny",
    "permissionDecisionReason":"Z.ai web-search-prime tool is disabled for zai session. Use mcp__MiniMax__web_search."
   }
  }))
 elif provider=="minimax" and is_minimax_search_tool:
  print(json.dumps({
   "hookSpecificOutput":{
    "hookEventName":"PreToolUse",
    "permissionDecision":"allow",
    "permissionDecisionReason":"Allowing MiniMax web_search MCP tool for minimax session."
   }
  }))
 elif provider=="minimax" and is_zai_search_tool:
  print(json.dumps({
   "hookSpecificOutput":{
    "hookEventName":"PreToolUse",
    "permissionDecision":"deny",
    "permissionDecisionReason":"Z.ai web-search-prime tool is blocked in minimax session. Use mcp__MiniMax__web_search."
   }
  }))
`;
