import os
import random
import joblib
import pandas as pd

# ==========================================================
# MedGuardian AI
# Predictor Engine V3
# ==========================================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

MODEL_PATH = os.path.join(
    BASE_DIR,
    "medguardian_ai_model.pkl"
)

KB_PATH = os.path.join(
    BASE_DIR,
    "Medical_Knowledge_Base_for_AI.xlsx"
)

# ==========================================================
# Load AI Model
# ==========================================================

print("Loading AI Model...")

model = joblib.load(MODEL_PATH)

print("✅ AI Model Loaded")

# ==========================================================
# Load Knowledge Base
# ==========================================================

print("Loading Knowledge Base...")

knowledge = pd.read_excel(
    KB_PATH,
    header=1
)

print("✅ Knowledge Base Loaded")

# ==========================================================
# Helper Functions
# ==========================================================

def confidence_level(confidence):

    if confidence >= 90:
        return "Excellent"

    elif confidence >= 80:
        return "High"

    elif confidence >= 70:
        return "Good"

    elif confidence >= 50:
        return "Moderate"

    return "Low"


def priority_level(risk):

    risk = str(risk).strip().lower()

    if risk == "critical":
        return "EMERGENCY"

    elif risk == "high":
        return "HIGH PRIORITY"

    elif risk == "medium":
        return "MEDIUM PRIORITY"

    return "LOW PRIORITY"


# ==========================================================
# Predict Patient
# ==========================================================

def predict_patient(
    heart_rate,
    spo2,
    temperature,
    medex
):

    patient = pd.DataFrame([{

        "Heart_Rate": heart_rate,

        "SpO2": spo2,

        "Temperature": temperature,

        "Medex_Level": medex

    }])

    prediction = model.predict(patient)[0]

    probabilities = model.predict_proba(patient)[0]

    confidence = float(
        probabilities.max() * 100
    )

    result = knowledge[
        knowledge["AI_Label"] == prediction
    ].iloc[0]

    reliability = confidence_level(confidence)

    priority = priority_level(
        result["Risk_Level"]
    )

    reasoning = []

    if heart_rate > 100:
        reasoning.append(
            f"Elevated Heart Rate ({heart_rate} BPM)"
        )


    if spo2 < 94:
        reasoning.append(
            f"Reduced Oxygen Saturation ({spo2}%)"
        )

    if temperature >= 37.8:
        reasoning.append(
            f"Elevated Temperature ({temperature:.1f}°C)"
        )

    elif temperature <= 35:
        reasoning.append(
            f"Low Temperature ({temperature:.1f}°C)"
        )

    if medex >= 60:
        reasoning.append(
            f"High Medex Level ({medex})"
        )

    elif medex <= 20:
        reasoning.append(
            f"Low Medex Level ({medex})"
        )
            # ======================================================
    # Top 3 Predictions
    # ======================================================

    top_indices = probabilities.argsort()[-3:][::-1]

    top_predictions = []

    for index in top_indices:

        label = model.classes_[index]

        kb_row = knowledge[
            knowledge["AI_Label"] == label
        ]

        if kb_row.empty:
            continue

        kb_row = kb_row.iloc[0]

        top_predictions.append({

            "diagnosis": kb_row["Clinical_Condition"],

            "probability": round(
                probabilities[index] * 100,
                2
            )

        })

    # ======================================================
    # Return Result
    # ======================================================

    return {
        "label": int(result["AI_Label"]),
        
        "diagnosis": result["Clinical_Condition"],

        "confidence": round(confidence,2),

        "reliability": reliability,

        "priority": priority,

        "risk": result["Risk_Level"],

        "severity": result["Severity"],

        "recommendation": result["Recommendation_AI"],

        "action": result["Action"],

        "follow_up": result["Follow_Up"],

        "first_aid": result["First_Aid"],

        "medication": result["Common_Medications_Examples_Only"],

        "warning": result["Medication_Warning"],

        "specialist": result["Required_Specialist"],

        "hospital": result["Hospital_Required"],

        "reasoning": reasoning,

        "top_predictions": top_predictions

    }


# ==========================================================
# Clinical Case Generator
# ==========================================================

def generate_patient(case_id):

    case = knowledge[
        knowledge["AI_Label"] == case_id
    ]

    if case.empty:
        return None

    case = case.iloc[0]

    return {

        "Heart_Rate": random.randint(
            int(case["HR_Min"]),
            int(case["HR_Max"])
        ),

        "SpO2": random.randint(
            int(case["SpO2_Min"]),
            int(case["SpO2_Max"])
        ),

        "Temperature": round(
            random.uniform(
                float(case["Temp_Min_C"]),
                float(case["Temp_Max_C"])
            ),
            1
        ),

        "Medex_Level": random.randint(
            int(case["Medex_Min"]),
            int(case["Medex_Max"])
        ),

        "Clinical_Condition": case[
            "Clinical_Condition"
        ]
    }


print("✅ Predictor Engine Ready")