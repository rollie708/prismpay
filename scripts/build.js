import { mkdir, writeFile } from 'node:fs/promises';
// Vercel routes everything through the server. Never publish the repository as static output.
await mkdir(new URL('../dist/',import.meta.url),{recursive:true});
await writeFile(new URL('../dist/.gitkeep',import.meta.url),'');
console.log('Server-routed build ready. Run migrations separately before deployment.');
