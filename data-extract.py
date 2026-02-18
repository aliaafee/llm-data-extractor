import os
import json
from pathlib import Path
from openai import OpenAI

# Initialize client
# client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# ----------- CONFIGURE VARIABLES TO EXTRACT -----------
variables_to_extract = {
    "delirium": "Presence of delirium (Yes/No). Presence/absence of delirium diagnosed by treating physician (Neurosurgeon, Intensivist, Psychiatrist)",
    "age": "Patient age in years (integer)",
    "sex": "Patient biological sex (Male/Female)",
    "comorbidities": "List of comorbid conditions (e.g., hypertension, diabetes)",
    "baseline_cognitive_impairment": "GCS at admission (integer)",
    "site_of_pathology": "cranial or spinal",
    "neurosurgical_diagnosis": "Primary neurosurgical diagnosis (e.g., subdural hematoma, brain tumor)",
    "diagnosis_group": "Diagnosis group (e.g., trauma, tumor, vascular, degenerative spine, infection, other neurological)",
    "list_of_opioids_used": "List of opioids used during hospital stay (e.g., morphine, fentanyl) with dose duration and frequency for each",
    "list_of_benzodiazepines_used": "List of benzodiazepines used during hospital stay (e.g., lorazepam, midazolam) with dose duration and frequency for each",
    "list_of_all_medications_used": "List of all medications used during hospital stay (e.g., morphine, lorazepam) with dose duration and frequency for each",
    "sodium_imbalance": "Presence of hyponatremia(Na+ < 130 mEq) or hypernatremia(Na+ > 150 mEq) during admission (Yes/No)",
    "infection": "Documented or presumed infection during admission (Yes/No)"
}

# ----------- FOLDER PATHS -----------
source_folder = Path("source_data")
output_folder = Path("output_data")

# Create output folder if it doesn't exist
output_folder.mkdir(exist_ok=True)

# ----------- PROMPT CONSTRUCTION HELPER -----------
def create_prompt(clinical_note):
    """Create system and user prompts for extraction"""
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
    return system_prompt, user_prompt

# ----------- API CALL HELPER -----------
def extract_data_openai(clinical_note):
    """Call OpenAI API to extract structured data from clinical note"""
    system_prompt, user_prompt = create_prompt(clinical_note)
    
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
    
    return response.output_parsed

def extract_data_test(clinical_note):
    """Test extraction without calling API"""
    system_prompt, user_prompt = create_prompt(clinical_note)
    print("System Prompt:\n", system_prompt)
    print("User Prompt:\n", user_prompt)
    return {key: None for key in variables_to_extract.keys()}

# ----------- PROCESS ALL CLINICAL NOTES -----------
def process_clinical_notes():
    """Process all JSON files in source_data folder"""
    # Get all JSON files from source_data
    json_files = list(source_folder.glob("*.json"))
    
    if not json_files:
        print("No JSON files found in source_data folder")
        return
    
    print(f"Found {len(json_files)} patient file(s) to process")
    
    for json_file in json_files:
        try:
            print(f"\nProcessing: {json_file.name}")
            
            # Read patient data
            with open(json_file, 'r', encoding='utf-8') as f:
                patient_data = json.load(f)
            
            # Extract clinical notes
            clinical_note = patient_data.get("clinical_notes", "")
            patient_id = patient_data.get("patient", {}).get("id", "unknown")
            
            if not clinical_note:
                print(f"  Warning: No clinical notes found for patient {patient_id}")
                continue
            
            # Extract data using API
            # structured_data = extract_data_openai(clinical_note)
            structured_data = extract_data_test(clinical_note)
            
            # Add patient metadata to output
            output_data = {
                "patient_id": patient_id,
                "source_file": json_file.name,
                "extracted_data": structured_data
            }
            
            # Save to output_data folder with same filename
            output_file = output_folder / json_file.name
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(output_data, f, indent=2)
            
            print(f"  ✓ Saved results to: {output_file.name}")
            
        except Exception as e:
            print(f"  ✗ Error processing {json_file.name}: {str(e)}")
            continue

# ----------- MAIN EXECUTION -----------
if __name__ == "__main__":
    process_clinical_notes()
    print("\n✓ Processing complete!")
