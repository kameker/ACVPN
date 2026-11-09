const path=require('node:path');
function normalizeApplicationPath(value){
 if(typeof value!=='string'||value.length>32767||/[\x00-\x1f]/.test(value))throw Error('Invalid application path');
 const input=value.trim();if(!path.win32.isAbsolute(input)||!(/^[a-z]:[\\/]/i.test(input)||/^\\\\[^\\]+\\[^\\]+/.test(input))||path.win32.extname(input).toLowerCase()!=='.exe')throw Error('Invalid application path');
 return path.win32.normalize(input);
}
module.exports={normalizeApplicationPath};
