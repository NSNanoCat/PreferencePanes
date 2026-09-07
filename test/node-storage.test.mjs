import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("Node util Storage persists path writes across processes", () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "preference-path-test-"));
  const script = `
    import {createSettingsHandler} from ${JSON.stringify(new URL("../index.mjs", import.meta.url).href)};
    const handler=createSettingsHandler({origin:'https://example.org',storageKey:'NodeConfig',fields:[{key:'Feature.enabled',name:'Enabled',type:'boolean'}]});
    const request={url:'https://example.org/api/Feature/enabled',method:'GET',headers:{'X-Settings-Client':'1','Content-Type':'application/json'}};
    if(process.env.PP_WRITE) handler({...request,method:'POST',body:'false'});
    console.log(handler(request).body);
  `;
  execFileSync(process.execPath, ["--input-type=module", "-e", script], { cwd, env: { ...process.env, PP_WRITE: "1" } });
  assert.equal(execFileSync(process.execPath, ["--input-type=module", "-e", script], { cwd, encoding: "utf8" }).trim(), "false");
});
