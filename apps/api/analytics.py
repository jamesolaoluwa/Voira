"""
Speech analytics utilities (non-LLM, deterministic).
Calculates filler word counts, confidence scores, and clarity metrics.
"""
import re
from typing import Dict, List, Tuple

# Configurable filler word list (case-insensitive, phrase-aware)
FILLER_WORDS = [
    "um",
    "uh",
    "like",
    "you know",
    "so",
    "actually",
    "basically",
    "kind of",
    "sort of",
    "literally",
    "really",
    "just",
    "well",
    "I mean",
    "you see",
    "right",
    "okay",
    "ok",
]


def detect_filler_words(text: str) -> Dict[str, int]:
    """
    Detect and count filler words in raw transcript.
    
    Args:
        text: Raw verbatim transcript (may contain filler words)
    
    Returns:
        Dictionary mapping filler word to count
    """
    if not text:
        return {}
    
    text_lower = text.lower()
    filler_counts = {}
    
    for filler in FILLER_WORDS:
        # Handle multi-word fillers (e.g., "you know", "kind of")
        if " " in filler:
            # Use word boundaries for multi-word phrases
            pattern = r'\b' + re.escape(filler.lower()) + r'\b'
        else:
            # Single word: use word boundaries
            pattern = r'\b' + re.escape(filler.lower()) + r'\b'
        
        matches = re.findall(pattern, text_lower)
        count = len(matches)
        if count > 0:
            filler_counts[filler] = count
    
    return filler_counts


def detect_repetitions(text: str) -> int:
    """
    Detect repetition clusters (same word/phrase repeated 2+ times).
    
    Args:
        text: Raw verbatim transcript
    
    Returns:
        Number of repetition clusters detected
    """
    if not text:
        return 0
    
    words = text.lower().split()
    if len(words) < 2:
        return 0
    
    repetition_clusters = 0
    i = 0
    
    while i < len(words) - 1:
        if words[i] == words[i + 1]:
            # Found a repetition, count the cluster
            cluster_length = 2
            j = i + 2
            while j < len(words) and words[j] == words[i]:
                cluster_length += 1
                j += 1
            
            # Only count if it's a meaningful repetition (2+ words)
            if cluster_length >= 2:
                repetition_clusters += 1
                i = j
            else:
                i += 1
        else:
            i += 1
    
    return repetition_clusters


def calculate_confidence_score(
    filler_word_count: int,
    repetition_clusters: int,
    total_words: int
) -> int:
    """
    Calculate confidence score using heuristic (deterministic, no ML).
    
    Algorithm:
    - Start at 100
    - Subtract 2 points per filler word
    - Subtract 1 point per repetition cluster
    - Clamp between 0-100
    
    Args:
        filler_word_count: Total number of filler words detected
        repetition_clusters: Number of repetition clusters
        total_words: Total word count in transcript
    
    Returns:
        Confidence score (0-100)
    """
    score = 100
    
    # Subtract 2 points per filler word
    score -= filler_word_count * 2
    
    # Subtract 1 point per repetition cluster
    score -= repetition_clusters * 1
    
    # Clamp between 0-100
    score = max(0, min(100, score))
    
    return int(score)


def calculate_clarity_score(text: str) -> int:
    """
    Calculate clarity score based on structure and coherence (heuristic).
    
    Factors:
    - Sentence length variation (good variation = higher score)
    - Presence of complete sentences
    - Word count (too short or too long = lower score)
    
    Args:
        text: Raw verbatim transcript
    
    Returns:
        Clarity score (0-100)
    """
    if not text or len(text.strip()) < 10:
        return 50  # Default for very short text
    
    # Split into sentences (simple heuristic: split on . ! ?)
    sentences = re.split(r'[.!?]+', text)
    sentences = [s.strip() for s in sentences if s.strip()]
    
    if len(sentences) == 0:
        return 50
    
    # Calculate average sentence length
    sentence_lengths = [len(s.split()) for s in sentences]
    avg_length = sum(sentence_lengths) / len(sentence_lengths) if sentence_lengths else 0
    
    # Ideal sentence length: 10-20 words
    # Score based on how close to ideal
    if 10 <= avg_length <= 20:
        length_score = 30
    elif 5 <= avg_length < 10 or 20 < avg_length <= 30:
        length_score = 20
    else:
        length_score = 10
    
    # Sentence variation (coefficient of variation)
    if len(sentence_lengths) > 1:
        mean = sum(sentence_lengths) / len(sentence_lengths)
        variance = sum((x - mean) ** 2 for x in sentence_lengths) / len(sentence_lengths)
        std_dev = variance ** 0.5
        cv = (std_dev / mean) if mean > 0 else 0
        variation_score = min(30, int(cv * 100))  # Higher variation = better
    else:
        variation_score = 15
    
    # Complete sentences (presence of punctuation)
    has_punctuation = bool(re.search(r'[.!?]', text))
    punctuation_score = 20 if has_punctuation else 10
    
    # Word count factor
    word_count = len(text.split())
    if 20 <= word_count <= 500:
        word_count_score = 20
    elif 10 <= word_count < 20 or 500 < word_count <= 1000:
        word_count_score = 15
    else:
        word_count_score = 10
    
    total_score = length_score + variation_score + punctuation_score + word_count_score
    
    # Clamp between 0-100
    return max(0, min(100, total_score))


def analyze_transcript(raw_transcript: str) -> Dict:
    """
    Comprehensive transcript analysis (non-LLM, deterministic).
    
    Args:
        raw_transcript: Raw verbatim transcript (includes filler words)
    
    Returns:
        Dictionary with analytics:
        {
            "total_words": int,
            "filler_word_count": int,
            "filler_word_frequency": float,  # percentage
            "filler_word_breakdown": Dict[str, int],
            "repetition_clusters": int,
            "confidence_score": int,  # 0-100
            "clarity_score": int,  # 0-100
        }
    """
    if not raw_transcript or not raw_transcript.strip():
        return {
            "total_words": 0,
            "filler_word_count": 0,
            "filler_word_frequency": 0.0,
            "filler_word_breakdown": {},
            "repetition_clusters": 0,
            "confidence_score": 50,
            "clarity_score": 50,
        }
    
    # Word count
    words = raw_transcript.split()
    total_words = len(words)
    
    # Filler word detection
    filler_breakdown = detect_filler_words(raw_transcript)
    filler_word_count = sum(filler_breakdown.values())
    filler_word_frequency = (filler_word_count / total_words * 100) if total_words > 0 else 0.0
    
    # Repetition detection
    repetition_clusters = detect_repetitions(raw_transcript)
    
    # Confidence score (heuristic)
    confidence_score = calculate_confidence_score(
        filler_word_count=filler_word_count,
        repetition_clusters=repetition_clusters,
        total_words=total_words
    )
    
    # Clarity score (heuristic)
    clarity_score = calculate_clarity_score(raw_transcript)
    
    return {
        "total_words": total_words,
        "filler_word_count": filler_word_count,
        "filler_word_frequency": round(filler_word_frequency, 2),
        "filler_word_breakdown": filler_breakdown,
        "repetition_clusters": repetition_clusters,
        "confidence_score": confidence_score,
        "clarity_score": clarity_score,
    }
