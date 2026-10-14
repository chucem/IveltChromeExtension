#!/usr/bin/env bash
# Writes release notes to ai-notes.md with Google's Gemini API (free tier), based on
# the commit messages since the previous release tag. Used by release.yml,
# prerelease.yml and release-notes.yml.
#
# Needs the GEMINI_API_KEY repository secret. If the notes can't be written (no key,
# Gemini busy or down) it fails, so the release isn't published without them - re-run
# the failed job, or skip the AI notes: set SKIP_AI_NOTES=true (the workflows set it
# from their "Skip AI release notes" option or the SKIP_AI_NOTES repository variable).
# The notes are wrapped in <!-- ai-notes --> markers, so they can be replaced later
# (release-notes.yml).
#
# Usage: ai-release-notes.sh <test|release>   (run with the release's commit checked out)

set -uo pipefail

kind="${1:-release}"
out=ai-notes.md
rm -f "$out"

if [ "${SKIP_AI_NOTES:-}" = "true" ]; then
  echo "::notice::Skipping the AI release notes (SKIP_AI_NOTES)"
  exit 0
fi

if [ -z "${GEMINI_API_KEY:-}" ]; then
  echo "::error::No GEMINI_API_KEY secret. Add it in Settings -> Secrets and variables -> Actions, or skip the AI notes (Run workflow -> \"Skip AI release notes\", or the SKIP_AI_NOTES=true repository variable)."
  exit 1
fi

# A real release covers everything since the previous real release (skipping test
# tags like v2.6.0-beta.1); a test version covers the changes since the last tag
if [ "$kind" = "release" ]; then
  prev=$(git describe --tags --abbrev=0 --exclude '*-*' HEAD^ 2>/dev/null || true)
else
  prev=$(git describe --tags --abbrev=0 HEAD^ 2>/dev/null || true)
fi

# Only changes to the extension itself matter to users (not workflows, store assets...)
range="${prev:+$prev..}HEAD"
log=$(git log --no-merges --reverse --format='- %s%n%w(0,2,2)%b' "$range" -- extension | head -c 30000)
if [ -z "$log" ]; then
  echo "::notice::No extension changes since ${prev:-the beginning} - skipping AI release notes"
  exit 0
fi

if [ "$kind" = "test" ]; then
  what="a TEST version that users install by hand to try new features before they reach the Chrome Web Store"
  extra="After the list of changes, add a short numbered \"what to test\" list based on the changes, and ask everyone to also retest the features they normally use."
else
  what="a new release that users get from the Chrome Web Store"
  extra=""
fi

prompt=$(cat <<EOF
You write release notes for "iVelt Helper" (אייוועלט העלפער), a free Chrome extension for the Yiddish forum ivelt.com. The readers are ordinary forum members, not programmers.

This is $what. Below are the commit messages since the previous release, oldest first.

Write the release notes in GitHub Markdown:
1. First in Yiddish, the way it's written on ivelt (Hasidic Yiddish in Hebrew letters, with forum words like תגובה, אשכול, עטעטשמענט, אנשטעלונגען). Wrap the whole Yiddish part in <div dir="rtl"> and </div>, with a blank line after the opening tag and before the closing tag.
2. Then a line with ---, then the same notes in English.

In each language: a short heading, then the changes grouped under a few headings with an emoji each (for example uploads, images, colors, fixes). Describe what users can now do or what got fixed, in plain words. $extra

Rules: only mention what is in the commits - never invent features. If a change was later undone by a "Revert" commit, leave out both the change and the revert. Leave out internal things (code refactoring, workflows, build files, branding files, README, version bumps, review suggestions) unless users notice them. No commit hashes, file names or function names. Keep it short. Output only the Markdown, with no introduction and no code fences.

Commits:
$log
EOF
)

body=$(jq -n --arg p "$prompt" '{contents: [{parts: [{text: $p}]}], generationConfig: {temperature: 0.3}}')

# Gemini's free tier is sometimes "experiencing high demand": wait and retry, then
# fall back to the lighter model
models="${GEMINI_MODEL:-gemini-flash-latest gemini-flash-lite-latest}"
text=""
for model in $models; do
  for attempt in 1 2 3; do
    resp=$(curl -sS --max-time 120 \
        -H "x-goog-api-key: $GEMINI_API_KEY" \
        -H 'Content-Type: application/json' \
        -d "$body" \
        "https://generativelanguage.googleapis.com/v1beta/models/$model:generateContent" 2>&1) || true
    text=$(jq -r '.candidates[0].content.parts[0].text // empty' <<<"$resp" 2>/dev/null)
    if [ -n "$text" ]; then
      echo "Notes written by $model (attempt $attempt)"
      break 2
    fi
    reason=$(jq -r '.error.message // .promptFeedback.blockReason // empty' <<<"$resp" 2>/dev/null)
    echo "::notice::$model attempt $attempt: ${reason:-$(head -c 200 <<<"$resp")}"
    [ "$attempt" -lt 3 ] && sleep $((attempt * 30))
  done
done

if [ -z "$text" ]; then
  echo "::error::Gemini didn't write the release notes (busy or unavailable). Nothing was published: re-run the failed job later, or run the workflow with \"Skip AI release notes\"."
  exit 1
fi

# Drop a code fence in case the model wrapped its answer in one anyway
{
  echo '<!-- ai-notes -->'
  printf '%s\n' "$text" | sed -e '1{/^```/d}' -e '${/^```$/d}'
  echo '<!-- /ai-notes -->'
} > "$out"
echo "Wrote AI release notes ($(wc -c < "$out") bytes) from the changes since ${prev:-the beginning}"
