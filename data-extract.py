import os
import json
from openai import OpenAI

# Initialize client
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# ----------- CONFIGURE VARIABLES TO EXTRACT -----------
variables_to_extract = {
    "age": "Patient age in years (integer)",
    "sex": "Patient biological sex (Male/Female/Other)",
    "diagnosis": "Primary diagnosis",
    "gcs_score": "Glasgow Coma Scale score if mentioned",
    "comorbidities": "List of comorbid conditions",
    "surgery_performed": "Type of surgery performed",
    "complications": "Any postoperative complications mentioned"
}

# ----------- CLINICAL NOTE INPUT -----------
clinical_note = """
Mr. Ahmed is a 67-year-old male who presented with progressive headache
and confusion. On examination GCS was 13 (E3V4M6).
CT brain showed left chronic subdural hematoma.
He is a known hypertensive and diabetic.
He underwent burr hole evacuation.
Postoperatively he developed mild pneumocephalus but recovered well.
"""

# ----------- PROMPT CONSTRUCTION -----------
system_prompt = """
You are a clinical data extraction assistant.
Extract only the requested variables from the provided clinical note.
Return the result as valid JSON.
If a variable is not mentioned, return null.
Do not add extra fields.
"""

user_prompt = f"""
Extract the following variables:

{json.dumps(variables_to_extract, indent=2)}

Clinical Note:
\"\"\"
{clinical_note}
\"\"\"
"""

# ----------- API CALL -----------
response = client.responses.create(
    model="gpt-4.1",  # reliable structured extraction
    input=[
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ],
    response_format={
        "type": "json_schema",
        "json_schema": {
            "name": "clinical_extraction",
            "schema": {
                "type": "object",
                "properties": {
                    key: {"type": ["string", "number", "array", "null"]}
                    for key in variables_to_extract.keys()
                },
                "additionalProperties": False
            }
        }
    }
)

# ----------- OUTPUT -----------
structured_data = response.output_parsed

print(json.dumps(structured_data, indent=2))
