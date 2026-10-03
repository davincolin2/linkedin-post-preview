# LinkedIn Post Engine: Workflow (@yosefdavinc)

This is the single source of truth. Any model or agent that adds posts to this repo must follow it.
Live site: https://davincolin2.github.io/linkedin-post-preview/

## Pipeline (6 steps, every batch)

```
1 RESEARCH  ->  2 WRITE DRAFT JSON  ->  3 GENERATE IMAGES  ->  4 WATERMARK  ->  5 ADD (validate + schedule)  ->  6 COMMIT + PUSH
```

### 1. Research (never skip)
* Search the web for news from the last 7 days. Prefer primary outlets (company blog, Reuters, CNBC Indonesia, Kompas, Detik, TechCrunch, The Verge).
* Every number, name, model version and date in a post must come from a source you actually read. Do not invent model names or versions.
* Record each source in the post's `sources` array. The tool rejects posts without sources.
* Mix in at least 1 Indonesia angle per batch when there is real Indonesian AI news.

### 2. Write the draft JSON
Create `drafts/YYYY-MM-DD_<slug>.json` holding an array of posts:

```json
[{
  "title": "Scroll stopping one line headline",
  "pillar": "news",
  "topic": "national-ai",
  "image": "jatiluhur_water_vs_ai_wm.jpg",
  "sources": ["https://www.cnbcindonesia.com/...", "Detik, 29 Sep 2026"],
  "video": null,
  "text": "<span class=\"hook\">Hook line</span>\n\n<span class=\"bl\">Section header:</span>\n\nBody...\n\nQuestion CTA?\n\n<span class=\"ht\">#Tag1 #Tag2</span>",
  "comment": "First comment (Bahasa Indonesia allowed for Indonesia posts)",
  "strategy": "Why this will perform"
}]
```

Do NOT fill date, day, month, year, status or pillarLabel. The tool schedules them.

**Allowed pillars:** news, hot-take, workflow, agent, comparison, toolkit, career, reality, future, framework, case-study, story, magic, lifehack
**Allowed topics:** national-ai, cybersecurity, geopolitics, career, tools, news, story, case-study, ugc-content

Pick the topic honestly. Indonesia policy or infrastructure = `national-ai`. Safety or security incidents = `cybersecurity`. Government or country rivalry = `geopolitics`.

### Writing rules
* **ZERO dashes.** No `-`, `–`, `—` in title, text, comment or strategy. Write "2026 to 2029", "multi step", "real time". (URLs inside `sources` are exempt.)
* Text at most 3000 characters, first comment at most 1250 (LinkedIn limits). The tool enforces this.
* Structure: hook span, short paragraphs, 2 to 4 `bl` section headers, end with a question, hashtag span.
* Vary pillars inside a batch. Do not make 6 news posts in a row: mix news, hot take, career, workflow, framework.
* Controversial is good, fabricated is not. Take a strong opinion about real facts.
* The best performers so far are insider or paradigm shift angles (rogue agents, AI deception, digital colony, Jatiluhur water vs rice) with an emotional Bahasa first comment on Indonesia posts.

### 3. Generate images (brand formula)
**Black and gold is the FRAME and ambience, not a filter.** The subject uses natural, topic relevant colors.

```
FINAL IMAGE = topic imagery in natural colors
            + dark/black ambient background or vignette (brand frame)
            + gold headline text and gold accent elements (brand signature)
```

Prompt template:
```
[Scene with its natural, topic relevant colors and context].
Dark ambient background with subtle black vignette edges.
Bold gold headline text: "[HEADLINE]".
Thin gold accent lines framing the composition.
Premium editorial style, elegant dark mode ambience. Aspect 4:3.
Leave the bottom right corner clean with no text or logos.
```

* Do NOT ask the image model to draw `@yosefdavinc`. The watermark script adds it. This avoids double watermarks.
* Color guide: agriculture/water = greens and blues, danger/safety = reds, tech products = purple/electric blue, government = cinematic blue and wood, Indonesia = natural Indonesian landscape.
* Every image must be new. Never reuse a filename.

### 4. Watermark
Copy each generated image into the repo root as `<slug>_wm.jpg`, then:
```
python tools/watermark.py a_wm.jpg b_wm.jpg ...
```

### 5. Add (validate + schedule + insert)
```
node tools/posts.js add drafts/YYYY-MM-DD_<slug>.json --dry   # checks only
node tools/posts.js add drafts/YYYY-MM-DD_<slug>.json         # writes index.html
node tools/posts.js validate                                   # full archive audit
```
The tool rejects the whole batch (writes nothing) on: any dash, a missing source, an unknown pillar or topic, an image that is missing or already used, a duplicate title, or a length over the limit.
It schedules each post on the next free day after the latest buffer post with the correct weekday and year, so parallel generators never collide.

**Time sensitive news: add `--start today`.** The evergreen buffer runs months ahead, so news batches would go stale at the end of the queue. With `--start today` the batch is scheduled on consecutive days from today (shared dates are reported as warnings, which is fine: ratings are keyed by month + date + title).
```
node tools/posts.js add drafts/YYYY-MM-DD_<slug>.json --start today
```

### 6. Commit and push
```
git add index.html drafts/ *_wm.jpg *_wm.png
git commit -m "feat(content): <n> posts <short topics>"
git push origin main
```
Branch: `main` only. Then open the live site and confirm the new cards render.

## Do not
* Do not edit the `posts` array by hand or by line number. Use `tools/posts.js`.
* Do not change `month`, `date` or `title` of existing posts. Ratings are stored under that key in localStorage.
* Do not hardcode years. The UI derives them from `year` (or Jan to Jun = 2027).
