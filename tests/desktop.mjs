import {_electron as electron} from '@playwright/test';
import assert from 'node:assert/strict';
const app=await electron.launch({args:['.'],cwd:process.cwd(),timeout:45000});
try{const page=await app.firstWindow();await page.getByRole('heading',{name:'O primeiro guardião.'}).waitFor({timeout:30000});assert(page.url().startsWith('http://127.0.0.1:4310'));await page.screenshot({path:'/tmp/zeus-desktop.png'});console.log('PASS Electron: compiled frontend + forked API, first-run screen, isolated context');}finally{await app.close();}
