# Review-item memory image standard

This is the project rule for agents that generate or replace a review item's memory image. Read the saved item first; use its `original`, `patterns`, `meaning_zh`, and `examples` as the source. A generated image should help recall the item **and** teach the usage shown in the item.

## Required content

For a grammar item, put the following legible text in the image:

1. The exact grammar expression (`original`), visually prominent.
2. The connection form from the item, such as `動詞辞書形／た形＋が早いか`.
3. A short Chinese meaning or usage cue that states the key relationship.
4. One natural Japanese example that actually uses the expression, copied from the item's `examples[].ja`, with its matching `examples[].zh` translation.
5. Any short form distinction essential to this item. For `～が早いか`, label `辞書形／た形＝普通体`.

For a vocabulary item, show the exact word, a short meaning or usage cue, and one natural example with its translation. Add a reading or form note only when it helps distinguish the word.

Do not invent a connection, example, translation, or grammar restriction when the item lacks one. Resolve missing source content before generating the image. Keep Chinese and Japanese as separate, easily scanned lines. Do not put furigana into the image unless the learner explicitly asks for it; the site's furigana switch cannot hide text baked into a bitmap.

## Composition and text quality

- Use one memorable scene tied to the example. Reserve a high-contrast teaching area for the required text. The image must remain readable as a small card thumbnail and when opened at full size.
- Keep the scene and text consistent: the Japanese example, Chinese translation, and depicted action should all describe the same event.
- Quote every line of text verbatim in the image-generation prompt. Inspect the output at full resolution for missing strokes, wrong glyphs, altered punctuation, and cropped lines. Regenerate or edit until every required line is correct.
- Prefer one example over several tiny examples. Do not trade legibility for more content. Avoid logos, watermarks, invented signage, and unrelated text.
- Save the selected image and its prompt in the project workspace before uploading. Use versioned names for revisions; do not overwrite an earlier image while it is still attached to an item.

## Upload and replacement

Upload through `attach_review_item_image` with `itemId`, `image_base64` (raw Base64, without a `data:` prefix), the matching MIME type, and a short caption. PNG, JPEG, WebP, and GIF are supported; the image must be at most 5 MB. Attach the new image first. Read the item back to confirm its new `images[].id`, and check the learner-facing image if available. Then remove the old image with `remove_review_item_image` and read back again to confirm only the intended image remains. Report image generation, MCP attachment, and website display as separate verification steps.

## Prompt template

```text
Edit target or scene: <existing image to preserve, or a concrete scene matching the example>
Use: JLPT review-card memory image, readable at thumbnail size and full size.
Style and composition: <style>; one clear scene; high-contrast teaching area.
Text, verbatim, in this order:
<exact original>
<exact connection form>
<optional essential form note>
<short meaning/usage cue>
例：<exact examples[].ja>
<exact examples[].zh>
Constraints: Do not alter any characters, add other text, crop a line, or obscure the action. Keep Japanese and Chinese on distinct lines. No watermark or logo.
```

### Current example: IT-000001

```text
～が早いか
動詞辞書形／た形＋が早いか
辞書形／た形＝普通体
刚一……就……｜A刚发生，B几乎同时发生
例：山田さんは空港に着くが早いか、コンビニに駆け込んだ。
山田刚一到机场，就冲进了便利店。
```
