"""Regenerate the small two-page PDF used by the browser extraction tests."""

from pathlib import Path

from reportlab.pdfgen import canvas


target = Path(__file__).with_name("text_and_blank.pdf")
pdf = canvas.Canvas(str(target), pagesize=(595, 842), invariant=1)
pdf.setTitle("Audiobook Studio PDF fixture")
pdf.setFont("Helvetica", 16)
pdf.drawString(72, 770, "Capitulo de teste")
pdf.setFont("Helvetica", 11)
pdf.drawString(72, 735, "Texto local para extracao verificavel.")
pdf.showPage()
pdf.showPage()
pdf.save()
