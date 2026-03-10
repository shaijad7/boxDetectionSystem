"""
Report route — GET /report/{session_id}
Generates a PDF report for a detection session using reportlab.
"""

import io
import os
from datetime import datetime
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

router = APIRouter()


def _get_db():
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore

        creds_path = os.getenv("FIREBASE_CREDENTIALS_PATH", "../shared/config/firebase_config.json")
        project_id = os.getenv("FIREBASE_PROJECT_ID")

        if not firebase_admin._apps:
            cred = credentials.Certificate(creds_path)
            firebase_admin.initialize_app(cred, {"projectId": project_id})

        return firestore.client()
    except Exception as e:
        print(f"[Report] Firebase error: {e}")
        return None


def _fetch_session(session_id: str) -> Optional[Dict[str, Any]]:
    db = _get_db()
    if not db:
        return None
    doc = db.collection("detection_sessions").document(session_id).get()
    return doc.to_dict() if doc.exists else None


def _generate_pdf(session: Dict[str, Any]) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.platypus import (Paragraph, SimpleDocTemplate, Spacer,
                                    Table, TableStyle)

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=2 * cm, leftMargin=2 * cm, rightMargin=2 * cm)
    styles = getSampleStyleSheet()
    story = []

    # Title
    story.append(Paragraph("Box Detection Session Report", styles["Title"]))
    story.append(Spacer(1, 0.4 * cm))

    # Meta info
    story.append(Paragraph(f"<b>Session ID:</b> {session.get('session_id', 'N/A')}", styles["Normal"]))
    story.append(Paragraph(f"<b>Date:</b> {session.get('started_at', 'N/A')}", styles["Normal"]))
    story.append(Paragraph(f"<b>Video Source:</b> {session.get('video_source', 'N/A')}", styles["Normal"]))
    story.append(Spacer(1, 0.6 * cm))

    # Stats table
    frames = session.get("frames_processed", 0)
    boxes = session.get("total_boxes_detected", 0)
    peak = session.get("peak_count", 0)
    avg = session.get("average_boxes_per_frame", 0)

    data = [
        ["Metric", "Value"],
        ["Total Boxes Detected", str(boxes)],
        ["Frames Processed", str(frames)],
        ["Peak Count (per frame)", str(peak)],
        ["Average Boxes / Frame", f"{avg:.2f}"],
    ]

    table = Table(data, colWidths=[10 * cm, 6 * cm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e293b")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 11),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#f8fafc"), colors.white]),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))

    story.append(Paragraph("Detection Statistics", styles["Heading2"]))
    story.append(Spacer(1, 0.2 * cm))
    story.append(table)
    story.append(Spacer(1, 0.8 * cm))

    # Footer note
    story.append(Paragraph(
        f"Report generated on {datetime.utcnow().strftime('%Y-%m-%d %H:%M')} UTC by Box Detection AI System.",
        styles["Italic"]
    ))

    doc.build(story)
    return buffer.getvalue()


@router.get("/report/{session_id}")
async def generate_report(session_id: str):
    """Generate and return a PDF report for a given session_id."""
    session = _fetch_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")

    pdf_bytes = _generate_pdf(session)

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=report_{session_id[:8]}.pdf"}
    )
