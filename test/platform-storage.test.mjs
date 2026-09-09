import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

for (const platform of ["node", "quantumult"])
    test(`${platform}: storage bridge uses the real util persistence backend`, () => {
        const cwd = mkdtempSync(path.join(os.tmpdir(), "preference-platform-"));
        const globals = platform === "quantumult" ? "const db=new Map();globalThis.$task={};globalThis.$prefs={valueForKey:k=>db.get(k),setValueForKey:(v,k)=>{db.set(k,v);return true;}};" : "";
        const script = `
    ${globals}
    const {Store}=await import(${JSON.stringify(new URL("../src/Store.mjs", import.meta.url).href)});
    const handler=new Store();
    const req={url:'https://example.org/api/set',method:'POST',body:'@Root.Module.Settings.enabled=false',headers:{'Content-Type':'application/x-www-form-urlencoded'}};
    if((await handler.handle(req)).status!==200)throw Error('write failed');
    console.log((await handler.handle({...req,url:'https://example.org/api/get'})).body);
    if((await handler.handle({...req,url:'https://example.org/api/delete'})).status!==200)throw Error('delete failed');
  `;
        assert.equal(execFileSync(process.execPath, ["--input-type=module", "-e", script], { cwd, encoding: "utf8" }).trim(), "false");
    });
