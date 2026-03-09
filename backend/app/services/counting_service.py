"""
Counting Service — aggregates detection results and persists to Firebase Firestore.
"""

import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.services.detection_service import DetectionResult

# Lazy Firebase import so the app still works without Firebase credentials
_db = None


def _get_db():
    global _db
    if _db is None:
        try:
            import firebase_admin
            from firebase_admin import credentials, firestore

            creds_path = os.getenv("FIREBASE_CREDENTIALS_PATH", "../shared/config/firebase_config.json")
            project_id = os.getenv("FIREBASE_PROJECT_ID")

            if not firebase_admin._apps:
                cred = credentials.Certificate(creds_path)
                firebase_admin.initialize_app(cred, {"projectId": project_id})

            _db = firestore.client()
        except Exception as e:
            print(f"[Firebase] Warning: Could not connect to Firestore — {e}")
            _db = None
    return _db


class DetectionSession:
    """Accumulates detection results for a single video session."""

    def __init__(self, video_source: str = "unknown"):
        self.session_id: str = str(uuid.uuid4())
        self.video_source: str = video_source
        self.started_at: datetime = datetime.now(timezone.utc)
        self.frames_processed: int = 0
        self.total_boxes_detected: int = 0
        self.per_frame_counts: List[int] = []
        self.peak_count: int = 0

    def record_frame(self, result: DetectionResult) -> None:
        """Record detection result from one processed frame."""
        self.frames_processed += 1
        self.total_boxes_detected += result.box_count
        self.per_frame_counts.append(result.box_count)
        self.peak_count = max(self.peak_count, result.box_count)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "session_id": self.session_id,
            "video_source": self.video_source,
            "started_at": self.started_at.isoformat(),
            "frames_processed": self.frames_processed,
            "total_boxes_detected": self.total_boxes_detected,
            "average_boxes_per_frame": (
                round(self.total_boxes_detected / self.frames_processed, 2)
                if self.frames_processed > 0
                else 0
            ),
            "peak_count": self.peak_count,
        }


def save_session_to_firebase(session: DetectionSession) -> Optional[str]:
    """
    Persist a completed detection session document to Firestore.

    Returns:
        Document ID on success, None if Firebase is unavailable.
    """
    db = _get_db()
    if db is None:
        print("[Counting] Firebase unavailable — session not persisted.")
        return None

    try:
        doc_ref = db.collection("detection_sessions").document(session.session_id)
        doc_ref.set(session.to_dict())
        print(f"[Counting] Session {session.session_id} saved to Firestore.")
        return session.session_id
    except Exception as e:
        print(f"[Counting] Failed to save session to Firebase — {e}")
        return None


def get_recent_sessions(limit: int = 20) -> List[Dict[str, Any]]:
    """Fetch the most recent detection sessions from Firestore."""
    db = _get_db()
    if db is None:
        return []

    try:
        docs = (
            db.collection("detection_sessions")
            .order_by("started_at", direction="DESCENDING")
            .limit(limit)
            .stream()
        )
        return [doc.to_dict() for doc in docs]
    except Exception as e:
        print(f"[Counting] Failed to fetch sessions — {e}")
        return []
