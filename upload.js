const { Client } = require('node-scp');

async function upload() {
  try {
    const client = await Client({
      host: '192.168.100.8',
      port: 22,
      username: 'respberry',
      password: 'repberry',
    });

    console.log("Connected to Raspberry Pi. Uploading main.js...");
    await client.uploadFile('./resbaerry/node/main.js', '/home/respberry/resbaerry/node/main.js');
    
    console.log("Uploading dist folder (this may take a minute)...");
    // Ensure the target directory exists and is empty or simply overwrite
    await client.uploadDir('./frontend/dist', '/home/respberry/resbaerry/dist');
    
    console.log("Upload successful!");
    client.close();
  } catch (e) {
    console.error("Upload failed:", e);
  }
}

upload();
