const test=require('node:test');const assert=require('node:assert/strict');const {EventEmitter}=require('node:events');const {createAppUpdates}=require('../src/app-updates');
test('downloaded updates wait until the app can safely install',async()=>{
 const updater=new EventEmitter();updater.checkForUpdates=async()=>{};let idle=false,installed=0;const c=createAppUpdates({updater,isSafe:()=>idle,install:()=>installed++});
 updater.emit('update-downloaded',{version:'1.0.2'});assert.equal(installed,0);assert.equal(c.state().status,'ready');idle=true;c.maybeInstall();assert.equal(installed,1);c.maybeInstall();assert.equal(installed,1);
});
test('update errors are reported and checks do not overlap',async()=>{
 const updater=new EventEmitter();let resolve,count=0;updater.checkForUpdates=()=>{count++;return new Promise(r=>resolve=r)};const c=createAppUpdates({updater,isSafe:()=>false,install:()=>{}});const a=c.check();await c.check();assert.equal(count,1);resolve();await a;updater.emit('error',Error('network'));assert.equal(c.state().status,'error');
});
