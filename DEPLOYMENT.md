# Deploying to Vercel

Takes about fifteen minutes. Do it well before the defence, not on the day.

---

## 1. MongoDB Atlas

1. Create a free **M0** cluster.
2. **Network Access → Add IP Address → Allow access from anywhere (`0.0.0.0/0`).**
   Vercel functions have no static IPs, so an allowlist of specific addresses will fail
   intermittently and confusingly.
3. **Database Access →** create a user with *Read and write to any database*.
4. Copy the connection string. It looks like
   `mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`.

If your password contains `@`, `/`, `:` or `#`, URL-encode it or the driver will misparse the host.

---

## 2. Generate the two secrets

```bash
node -e "console.log('AUTH_SECRET='+require('crypto').randomBytes(32).toString('base64'))"
node -e "console.log('ENCRYPTION_KEY='+require('crypto').randomBytes(32).toString('base64'))"
node -e "console.log('CRON_SECRET='+require('crypto').randomBytes(24).toString('hex'))"
```

> **`ENCRYPTION_KEY` is not rotatable.** Everything already encrypted — CV text, facts, transcripts,
> question banks — becomes permanently unreadable if you change it. Generate it once, store it
> somewhere you will still have it in six months, and never regenerate it "to be safe".

---

## 3. Create the Vercel project

1. Push this repository to GitHub.
2. **vercel.com → Add New → Project →** import the repo. The framework is detected automatically;
   leave the build settings alone.
3. **Settings → Functions → enable Fluid Compute.** The interview routes declare
   `maxDuration = 60`, which needs it.
4. **Settings → Environment Variables →** add everything from `.env.example`, for
   *Production*, *Preview* and *Development*:

   ```
   MONGODB_URI            mongodb+srv://…
   MONGODB_DB             interview_sim
   AUTH_SECRET            (generated above)
   ENCRYPTION_KEY         (generated above)
   CRON_SECRET            (generated above)
   NEXTAUTH_URL           https://your-app.vercel.app
   AUTH_TRUST_HOST        true

   STT_PROVIDER              speechmatics
   NEXT_PUBLIC_STT_PROVIDER  speechmatics
   TTS_PROVIDER              speechmatics
   LLM_PROVIDER              groq
   SEARCH_PROVIDER           tavily
   SCRAPE_PROVIDER           readability

   SPEECHMATICS_API_KEY   …
   SPEECHMATICS_RT_URL    wss://global.rt.speechmatics.com/v2
   SPEECHMATICS_MP_URL    https://mp.speechmatics.com/v1
   SPEECHMATICS_TTS_URL   https://preview.tts.speechmatics.com
   SPEECHMATICS_TTS_VOICE theo

   GROQ_API_KEY           …
   GROQ_MODEL             openai/gpt-oss-120b

   STT_TOKEN_TTL_SECONDS  300
   INTERVIEW_QUESTION_COUNT 6
   MAX_UPLOAD_BYTES       10485760
   SCRAPE_TIMEOUT_MS      10000
   SCRAPE_MAX_BYTES       2000000
   RETENTION_DAYS         90

   SEED_INTERVIEWER_EMAIL     you@yourdomain.com
   SEED_INTERVIEWER_PASSWORD  (something you will remember)
   ```

   `NEXT_PUBLIC_STT_PROVIDER` is inlined at build time, so changing it later needs a redeploy, not
   just a restart.

5. Deploy.

---

## 4. Seed the production database

Run this **once**, from your machine, pointed at the production cluster:

```bash
MONGODB_URI="mongodb+srv://…" npm run seed
```

It creates the indexes, the four starter roles, and the single interviewer account from
`SEED_INTERVIEWER_EMAIL` / `SEED_INTERVIEWER_PASSWORD`. It is idempotent — running it twice is
harmless.

There is no public interviewer signup by design, so this is the only way that account comes into
existence.

---

## 5. The retention cron

`vercel.json` already declares it:

```json
{ "crons": [{ "path": "/api/cron/purge", "schedule": "0 3 * * *" }] }
```

Vercel sends `Authorization: Bearer $CRON_SECRET`. Without `CRON_SECRET` set, the endpoint returns
503 and refuses to run — it fails closed rather than exposing a data-destroying endpoint publicly.

Hobby accounts allow one cron job per day, which is exactly what this needs.

---

## 6. Smoke-test the deployment

```bash
SMOKE_BASE_URL=https://your-app.vercel.app npm run smoke:interview
SMOKE_BASE_URL=https://your-app.vercel.app npm run smoke:privacy
```

Then by hand, on the deployed URL:

- [ ] Register a candidate, upload a real CV, check the extracted facts are actually yours
- [ ] Run a full spoken interview with a real microphone
- [ ] **Talk over the interviewer** and confirm it stops (barge-in)
- [ ] Watch the avatar's mouth track the speech
- [ ] Answer one question by typing instead
- [ ] Download the PDF
- [ ] Sign in as the interviewer and confirm you see pseudonyms, not names
- [ ] Reveal one identity, then check it appears in the audit log
- [ ] Delete a test account and confirm everything is gone

**Do this on a real Nigerian connection, not on campus wifi**, and ideally on the actual laptop and
network you will demo from. Latency to the Speechmatics EU endpoints and to Groq is the main
variable, and it is the one thing you cannot fix on the day.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| `Invalid environment configuration` at boot | A variable is missing. The error names it. |
| Login works locally, fails on Vercel | `NEXTAUTH_URL` wrong, or `AUTH_TRUST_HOST` not set. |
| `MongoServerSelectionError` | Atlas Network Access does not include `0.0.0.0/0`. |
| Transcripts read as empty strings | `ENCRYPTION_KEY` changed. The old data is unrecoverable. |
| TTS returns 502 | Speechmatics TTS is a preview service with no SLA. Check the portal, then consider the second adapter. |
| Interview never starts, `/api/interview/start` 502 | The Groq model in `GROQ_MODEL` was retired. List available models and update the variable. |
| Function timeout on `/api/interview/start` | Fluid Compute not enabled. |
| Microphone silently does nothing | Not HTTPS. `getUserMedia` requires a secure context — Vercel gives you this, `http://` on a LAN IP does not. |
