#!/usr/bin/env bash
# Writes release notes to ai-notes.md with Google's Gemini API (free tier), based on
# the commit messages since the previous release tag. Used by release.yml and
# prerelease.yml.
#
# Needs the GEMINI_API_KEY repository secret. Without it, or if anything goes wrong,
# it writes nothing and exits successfully, so the release still goes out with the
# usual notes.
#
# Usage: ai-release-notes.sh <test|release>

set -uo pipefail

kind="${1:-release}"
out=ai-notes.md
rm -f "$out"

if [ -z "${GEMINI_API_KEY:-}" ]; then
  echo "::notice::No GEMINI_API_KEY secret - skipping AI release notes"
  exit 0
fi

# Only changes to the extension itself matter to users (not workflows, store assets...)
prev=$(git describe --tags --abbrev=0 HEAD^ 2>/dev/null || true)
range="${prev:+$prev..}HEAD"
log=$(git log --no-merges --format='- %s%n%w(0,2,2)%b' "$range" -- extension | head -c 15000)
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

This is $what. Below are the commit messages since the previous release.

Write the release notes in GitHub Markdown:
1. First in Yiddish, the way it's written on ivelt (Hasidic Yiddish in Hebrew letters, with forum words like תגובה, אשכול, עטעטשמענט, אנשטעלונגען). Wrap the whole Yiddish part in <div dir="rtl"> and </div>, with a blank line after the opening tag and before the closing tag.
2. Then a line with ---, then the same notes in English.

In each language: a short heading, then the changes grouped under a few headings with an emoji each (for example uploads, images, colors, fixes). Describe what users can now do or what got fixed, in plain words. $extra

Rules: only mention what is in the commits - never invent features. Leave out internal things (code refactoring, workflows, build files, branding files, README, version bumps) unless users notice them. No commit hashes, file names or function names. Keep it short. Output only the Markdown, with no introduction and no code fences.

Commits:
$log
EOF
)

body=$(jq -n --arg p "$prompt" '{contents: [{parts: [{text: $p}]}], generationConfig: {temperature: 0.3}}')
model="${GEMINI_MODEL:-gemini-flash-latest}"

if ! resp=$(curl -sS --max-time 90 \
    -H "x-goog-api-key: $GEMINI_API_KEY" \
    -H 'Content-Type: application/json' \
    -d "$body" \
    "https://generativelanguage.googleapis.com/v1beta/models/$model:generateContent"); then
  echo "::warning::Gemini request failed - using the usual release notes"
  exit 0
fi

text=$(jq -r '.candidates[0].content.parts[0].text // empty' <<<"$resp" 2>/dev/null)
if [ -z "$text" ]; then
  echo "::warning::Gemini returned no notes - using the usual release notes: $(jq -c '.error.message // .promptFeedback // "unknown"' <<<"$resp" 2>/dev/null | head -c 300)"
  exit 0
fi

# Drop a code fence in case the model wrapped its answer in one anyway
printf '%s\n' "$text" | sed -e '1{/^```/d}' -e '${/^```$/d}' > "$out"
echo "Wrote AI release notes ($(wc -c < "$out") bytes) from the changes since ${prev:-the beginning}"
