const fs = require('fs');

function removeUploadedFile(filePath) {
  fs.unlink(filePath, (err) => {
    if (err && err.code !== 'ENOENT') {
      console.error('[uploads] could not remove temporary file:', err.message);
    }
  });
}

module.exports = { removeUploadedFile };
