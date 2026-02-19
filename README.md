# LLM Data Extractor

A web application that uses a local LLM (via [LocalAI](https://localai.io)) to extract structured clinical data from patient notes. Results are streamed back as each chunk is processed and persisted to a local SQLite database.

---

## Prerequisites

- [Node.js](https://nodejs.org) v18 or later
- A running LocalAI instance (or any OpenAI-compatible API endpoint)

---

## Project Structure

```
extract-webapp/
├── client/      # React + Vite frontend
└── server/      # Express API server
```

---

## 1. Install Dependencies

Install dependencies for both the server and the client.

```bash
# Server
cd extract-webapp/server
npm install

# Client
cd ../client
npm install
```

---

## 2. Configure the Environment

Create `extract-webapp/server/.env` by copying the example below:

```env
# Base URL of your LocalAI (or OpenAI-compatible) instance
LOCALAI_BASE_URL=http://localhost:8080/v1

# Model name as registered in your LocalAI setup
LOCALAI_MODEL=gpt-4

# Total context window size of the model (in tokens)
CONTEXT_SIZE=3000

# Tokens reserved for system/user prompt overhead and the response
# Increase this if you get truncated or malformed responses
PROMPT_OVERHEAD_TOKENS=1000
```

| Variable               | Description                                                          | Default                    |
|------------------------|----------------------------------------------------------------------|----------------------------|
| `LOCALAI_BASE_URL`     | Base URL of the OpenAI-compatible API                                | `http://localhost:8080/v1` |
| `LOCALAI_MODEL`        | Model identifier to use for completions                              | `gpt-4`                    |
| `CONTEXT_SIZE`         | Context window of the model in tokens                                | `4096`                     |
| `PROMPT_OVERHEAD_TOKENS` | Tokens to reserve for prompts and response, reducing chunk size    | `800`                      |

---

## 3. Build the Client

The server serves the compiled React app as static files from `server/public/`. Build it once before starting the server (and again after any frontend changes).

```bash
cd extract-webapp/client
npm run build
```

This outputs the built files to `extract-webapp/server/public/`.

---

## 4. Run the Server

```bash
cd extract-webapp/server
npm start
```

The server starts on **http://localhost:5000**.

Open your browser and navigate to [http://localhost:5000](http://localhost:5000).

---

## 5. Input File Format

Upload a JSON file with the following structure:

```json
{
  "patient": {
    "id": "0000000001",
    "sex": "MALE",
    "dob": "01-Jan-1981"
  },
  "encounters": [
    "29/Jan/2026 - NEURO SURGERY / Dr. Some One"
  ],
  "clinical_notes": "Date: Feb 17, 2026\nSection: Doctors Notes\n..."
}
```

- The `patient.id` is used as the primary key when saving results to the database.
- Only the `clinical_notes` field is sent to the LLM for extraction.
- Plain `.txt` files are also accepted; results will not be linked to a patient ID.

---

## 6. Using the App

### Extractor Tab

1. Click **Choose File** and select a `.json` or `.txt` patient file.
2. Click **Upload & Analyze**.
3. The table populates incrementally as each chunk is processed.
4. Results are automatically saved to the SQLite database on completion.

### Browse Results Tab

- Lists all previously processed patients ordered by most recent.
- Click **View** to see the full extracted data for any patient.
- Click **⟳ Refresh** to reload the list.

---

## Data Storage

Extracted results are stored in `extract-webapp/server/results.db` (SQLite). The schema is:

| Column       | Type | Description                        |
|--------------|------|------------------------------------|
| `patient_id` | TEXT | Primary key from `patient.id`      |
| `result`     | TEXT | Full extracted JSON (stringified)  |
| `updated_at` | TEXT | ISO 8601 timestamp of last update  |

Re-uploading a file for an existing patient **overwrites** the previous result.

The `results.db` file is excluded from version control via `.gitignore`.
