import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

for (const platform of ["node", "quantumult"])
  test(`${platform}: runtime BoxJS uses the real util persistence backend`, () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), "preference-platform-"));
    const globals =
      platform === "quantumult"
        ? "const db=new Map();globalThis.$task={};globalThis.$prefs={valueForKey:k=>db.get(k),setValueForKey:(v,k)=>{db.set(k,v);return true;}};"
        : "";
    const script = `
    ${globals}
    const {createSettingsHandler}=await import(${JSON.stringify(new URL("../src/index.mjs", import.meta.url).href)});
    const handler=createSettingsHandler({origin:'https://example.org',loadConfig:()=>[{id:'@Root.Module.Settings.enabled',name:'Enabled',type:'boolean',val:true}]});
    const req={url:'https://example.org/api/Module/Settings/enabled',method:'POST',body:'false',headers:{'X-Settings-Client':'1','Content-Type':'application/json'}};
    if((await handler(req)).status!==200)throw Error('write failed');
    console.log((await handler({...req,method:'GET'})).body);
    if((await handler({...req,method:'DELETE'})).status!==200)throw Error('delete failed');
  `;
    assert.equal(execFileSync(process.execPath, ["--input-type=module", "-e", script], { cwd, encoding: "utf8" }).trim(), "false");
  });
