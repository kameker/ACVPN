process.stdout.write(JSON.stringify({ event: 'notification', data: { title: 'ACVPN', body: 'Connection stopped' } }) + '\n');
process.stdout.write(JSON.stringify({ event: 'update-install' }) + '\n');
process.stdin.resume();
process.stdin.on('end', () => process.exit(0));
