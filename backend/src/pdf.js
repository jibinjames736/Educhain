const PDFDocument = require('pdfkit');

async function generatePDF(formData) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ margin: 50, size: 'A4', layout: 'landscape' });

    doc.on('data', chunks.push.bind(chunks));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Use university name from formData or a default
    const universityName = formData.universityName || 'CertVerify University';

    // Format current date as DD/MM/YYYY (e.g., 22/2/2026)
    const today = new Date();
    const day = today.getDate();
    const month = today.getMonth() + 1; // months are 0-based
    const year = today.getFullYear();
    const dateStr = `${day}/${month}/${year}`;

    doc.fontSize(26).font('Helvetica-Bold').text(universityName, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(22).font('Helvetica').text('Blockchain Certificate', { align: 'center' });
    doc.moveDown(1);
    doc.fontSize(16).text('This certifies that', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(24).font('Helvetica-Bold').text(formData.studentName, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(16).font('Helvetica').text('has successfully completed', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(20).font('Helvetica-Bold').text(formData.course, { align: 'center' });
    doc.moveDown(2);

    // Bottom line: Date Issued (left) and Certificate ID (right)
    doc.fontSize(14).font('Helvetica');
    doc.text(`Date Issued: ${dateStr}`, { align: 'left', continued: true });
    doc.text(`Certificate ID: ${formData.certId}`, { align: 'right' });

  

    doc.end();
  });
}

module.exports = { generatePDF };