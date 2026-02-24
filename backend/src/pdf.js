const PDFDocument = require('pdfkit');

async function generatePDF(formData) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ margin: 50 });

    doc.on('data', chunks.push.bind(chunks));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Example certificate layout
    doc.fontSize(25).text('Certificate of Completion', { align: 'center' });
    doc.moveDown();
    doc.fontSize(18).text(`This is to certify that`, { align: 'center' });
    doc.fontSize(22).text(formData.studentName, { align: 'center', underline: true });
    doc.moveDown();
    doc.fontSize(18).text(`has successfully completed the course`, { align: 'center' });
    doc.fontSize(20).text(formData.course, { align: 'center', bold: true });
    doc.moveDown();
    doc.fontSize(14).text(`Date: ${formData.date}`, { align: 'center' });

    // QR code will be embedded later (optional – you can generate and embed here)
    // For simplicity, we skip QR embedding in PDF; the verification URL is separate.
    // If you want QR, you would generate a QR image and embed it with doc.image().

    doc.end();
  });
}

module.exports = { generatePDF };
