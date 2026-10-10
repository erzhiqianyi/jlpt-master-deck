# データベース構造 v3：互換レイヤーをなくしたリレーショナルモデル

状態：**承認済み・実装中**（2026-10-09）。本書は日本語版です。中国語の原本 [schema-v3-design.md](schema-v3-design.md) と英語版 [schema-v3-design.en.md](schema-v3-design.en.md) は同じ内容で、3 つを同時に更新します。付録は 3 つとも同じ SQL からスクリプトで生成します。

**列の正式な一覧は [server/v3/schema.sql](../server/v3/schema.sql)**：すべてのテーブル・すべての列（`rid`、`user_id`、`position`、日時列、外部キー、制約、インデックスを含む）がコメント付きで記載され、SQLite で実際にデータベースを作って検証済みです。本書は各列の意味、値、旧データの出所を中心に説明します。サンプルデータベース：`.local/v3-work/sample.sqlite`（知識項目 W5 の 1 件だけを含む参照用）。

表の「旧データの出所」は、移行時にどこから値を取るかを示します。`テーブル.列` は旧テーブルの列、`item_json.xxx`、`settings_json.xxx` などは旧テーブルの JSON 列内のキーです。サンプルデータは本番データのコピー（2026-10-07：知識項目 496 件、問題 3,048 行）から取っています。

## 1. なぜ v3 か

v2 は「マッピング仕様」で旧 JSON をリレーショナルテーブルに分解し、互換ビューで旧 JSON を組み立て直していたため、旧コードを変更せずに済みました。その代わり、テーブル構造が業務ではなく旧 JSON によって決まっていました：

- `*_count`、`*_present` 列：旧 JSON をバイト単位で復元するために「省略 / 空配列 / 内容あり」を区別するだけの列。
- `deck` と `wordbook_id` の並存：組み込み単語帳は推定によるもので、実在の単語帳ではない。
- 同じ概念の書き方ごとに列がある：`prompt` / `question_text`、`item_id` / `item_ref`、`tested` / `tested_expression`、`source_draft_id` / `source_draft_ref`。
- 同じ問題が知識項目、下書き、練習、スナップショットにそれぞれ保存されている（3,048 行の問題の大半はコピー）。
- `*_extra` テーブルにモデル化されていないフィールドを保存し、`item_json_id` などの列は復元のためだけにある。

v3 の決定（2026-10-09 確定）：**旧 API との互換性は持たない**。サーバー、MCP、REST は新しいテーブルを直接読み書きし、API は新しい構造を返し、Web と iOS のデータモデルもあわせて変更します。旧データは元のテーブル（`legacy_v1_*`、または未移行のデータベースの元テーブル）から直接移行し、v2 の中間構造を経由しません。

## 2. 設計方針

1. **テーブルは業務に沿って作り、DDL は手で書く**。すべての列に業務上の意味があり、旧形式の復元のためだけの列は置かない。
2. **1 つの概念に 1 つの列**。旧データの複数の書き方は移行時に統合する。
3. **配列は子テーブルの行**で、順序は `position`（0 始まり）。長さは行数そのもので、別に保存しない。省略と空配列は区別しない。
4. **説明文はすべて `content_translations` に入れ**、言語ごとに 1 行。日本語の原文（例文、問題文、選択肢）は通常の列。以下の各テーブルの「翻訳フィールド」はそのテーブルの列ではなく、`content_translations` の中で `owner_table` = そのテーブル、`owner_rid` = その行の `rid`、`field` = フィールド名である行を指す。例として知識項目 W5（rid 347）の語義：

   | owner_table | owner_rid | field | language | text |
   |---|---|---|---|---|
   | knowledge_points | 347 | meaning | ja | 物事の全体を、大まかに見渡すこと。 |
   | knowledge_points | 347 | meaning | zh-Hans | 概观、概览 |
   | knowledge_points | 347 | meaning | en | overview, general survey |
5. **内部主キーは `rid`（自動採番の整数）**、外部には業務番号 `code`（W12、QV15 …、ユーザーごと・接頭辞ごとに採番）を使う。旧文字列 ID も旧番号（IT-000919 など）も新しいデータベースには入れない。移行スクリプトは一時的な対応表で旧参照を新しい `rid` につなぎ、移行が終わったら削除する。対応結果は確認用に移行レポートのファイルに書き出す。旧番号と旧リンクは以後使えなくなる。
6. **外部キーを実際に張る**：子テーブルは `ON DELETE CASCADE`。エンティティをまたぐ参照（問題 ↔ 知識項目、練習 ↔ 問題）は削除の意味に応じて `SET NULL` か削除禁止にする。
7. **問題は 1 か所だけに保存し、直接修正し、版を持たない**：練習、下書き、知識項目は関連テーブルで問題を参照する。選択肢には固定の番号（`question_options.rid`）があり、正解は選択肢に印を付ける。フロントエンドは出題時に選択肢をランダムに並べてよく、解答では選んだ選択肢の番号だけを記録し、当時選んだ選択肢と正解の選択肢の文字、正誤を保存する。問題を後で修正しても、過去の解答の正誤と正答率は変わらない。
8. **日時**は ISO 8601 の文字列（UTC、`Z` 付き）、**日付**は `YYYY-MM-DD`、**真偽値**は 0 / 1。

本文は設計の説明だけを扱い、各テーブルの全列（`rid`、`user_id`、`created_at`、`updated_at`、`position`、外部キー、制約を含む）は巻末の付録にあります。ユーザーに属するテーブル（見出しに「ユーザー別」と記載）はすべて `user_id`（所有ユーザー、FK → `users`）を持ち、業務番号 `code` はユーザーごとに採番します。子テーブルは親テーブルを通じてユーザーに属し、`user_id` を重ねて持ちません。

## 3. 共通テーブル

### `languages`：サポートする言語

全列（`rid`、`user_id`、日時列、外部キー、制約を含む）は付録 [`languages`](#languages) を参照。

### 多言語の対応関係：`languages`、`translatable_fields`、`content_translations`

3 つのテーブルの関係：

```
languages (code)                       12 言語
    ▲
    │ language
content_translations ──(owner_table, field)──▶ translatable_fields   どのテーブルのどのフィールドを翻訳できるか（66 件）
    │ (owner_table, owner_rid)
    ▼
任意の業務テーブルの 1 行（knowledge_points.rid = 347 …）
```

- **`translatable_fields`** は翻訳可能なフィールドをすべて登録する：`knowledge_points.meaning`、`knowledge_examples.translation`、`question_options.analysis` …… 合計 66 件で、全一覧は schema.sql の第 11 節にある。以下の各テーブルの「翻訳フィールド」はこのテーブルの行である。
- **`content_translations`** は文字そのものを保存する：1 フィールドの言語ごとに 1 行。`(owner_table, field)` は `translatable_fields` に登録済みで、`language` は `languages` に存在しなければならず、そうでなければデータベースが書き込みを拒否する。
- **`owner_table` + `owner_rid`** は業務テーブルの 1 行を指す。同じ列が数十のテーブルを指すため外部キーにはできない。そこで業務テーブルごとに削除トリガーを置き、業務行を削除するとその翻訳とふりがなも削除する。
- **読み込み時の言語フォールバック**：ユーザーの説明言語で取り出し、ない場合は `languages.fallback_code` をたどり（例：ko → en）、最後に zh-Hans を探す。結果には実際に使った言語とフォールバックかどうかを示す。

例：知識項目 W5（`knowledge_points.rid` = 347）とその最初の例文（`knowledge_examples.rid` = 758）の `content_translations` の行：

| owner_table | owner_rid | field | language | text | origin | verified |
|---|---|---|---|---|---|---|
| knowledge_points | 347 | meaning | ja | 物事の全体を、大まかに見渡すこと。 | migrated | 1 |
| knowledge_points | 347 | meaning | zh-Hans | 概观、概览 | migrated | 1 |
| knowledge_points | 347 | meaning | en | overview, general survey | ai | 0 |
| knowledge_points | 347 | explanation | zh-Hans | 从整体上把握事物的全貌。 | migrated | 1 |
| knowledge_examples | 758 | translation | zh-Hans | 概览日本经济的历史。 | migrated | 1 |
| knowledge_examples | 758 | translation | en | Survey the history of the Japanese economy. | ai | 0 |

説明言語を English にすると、W5 は meaning の en の行と explanation の zh-Hans の行を表示する（英語がないのでフォールバックし、「この言語の訳はまだありません」と表示する）。

#### `translatable_fields` の列

全列（`rid`、`user_id`、日時列、外部キー、制約を含む）は付録 [`translatable_fields`](#translatable_fields) を参照。

#### `content_translations` の列

全列（`rid`、`user_id`、日時列、外部キー、制約を含む）は付録 [`content_translations`](#content_translations) を参照。

主キーは `(owner_table, owner_rid, field, language)`。

### `ruby_annotations`：オンデマンドのふりがな

全列（`rid`、`user_id`、日時列、外部キー、制約を含む）は付録 [`ruby_annotations`](#ruby_annotations) を参照。

`[読み]` を取り除くと現在の原文と完全に一致しなければならない。原文が変わると古いふりがなは表示されなくなる。

### `id_sequences`：業務番号のカウンター

全列（`rid`、`user_id`、日時列、外部キー、制約を含む）は付録 [`id_sequences`](#id_sequences) を参照。

番号の接頭辞：W 単語類、G 文法類、N 名前類、WB 単語帳、QS 問題グループ、QV / QG / QR / QL 語彙 / 文法 / 読解 / 聴解の問題、MT 素材、DP / TP / MX デイリー / テーマ別 / 模擬練習、AT 練習記録、DR 下書き、DC 下書きのコメント、TK 計画タスク、RC 録音、IN 受信箱。

### `media_files`：画像と音声ファイル（ユーザー別）

全列（`rid`、`user_id`、日時列、外部キー、制約を含む）は付録 [`media_files`](#media_files) を参照。

音声の日本語スクリプトとその訳は素材テーブル `materials` にある（§6 参照）。

## 4. 設定

### `user_preferences`：表示と練習の設定（1 ユーザー 1 行）（ユーザー別）

全列（`rid`、`user_id`、日時列、外部キー、制約を含む）は付録 [`user_preferences`](#user_preferences) を参照。

### 設定の子テーブル

全列は付録を参照：[`user_card_templates`](#user_card_templates)、[`user_question_kinds`](#user_question_kinds)、[`user_daily_source_ratings`](#user_daily_source_ratings)、[`user_pos_styles`](#user_pos_styles)、[`user_question_type_tips`](#user_question_type_tips)、[`user_custom_tips`](#user_custom_tips)。

### 読み上げ設定（独立したテーブル）

`user_speech_settings`（1 ユーザー 1 行）（ユーザー別）

全列（`rid`、`user_id`、日時列、外部キー、制約を含む）は付録 [`user_speech_settings`](#user_speech_settings) を参照。

`user_speech_voices`：主キー `(user_id, provider)`

全列（`rid`、`user_id`、日時列、外部キー、制約を含む）は付録 [`user_speech_voices`](#user_speech_voices) を参照。

旧データはサービスごとに 1 組ずつ保存し、選んだことのないサービスは空文字列でした。実際に選んだものだけを移行します。音声サービスの API 認証情報は既存の `user_tts_credentials(user_id, provider, credential_encrypted)` のまま変えません。

移行しないもの：`memoryCardFieldsVersion`（カードのフィールド形式の版。移行時に一度換算すれば不要）、`requireJlptVocabularyQuestions`（`user_question_kinds` が空でないことと同じ）。

## 5. 単語帳と知識項目

### `wordbooks`：単語帳（ユーザー別）

全列（`rid`、`user_id`、日時列、外部キー、制約を含む）は付録 [`wordbooks`](#wordbooks) を参照。

一意制約：`(user_id, code)`、`(user_id, title)`。単語帳を削除する前に、中の知識項目を移動または削除する必要がある（`knowledge_points.wordbook_rid` は必須で、連動削除しない）。

- 組み込み単語帳はなく、カテゴリの制限もない：1 冊に単語・文法・名前を混在でき、知識項目の `kind`（word / grammar / name）で区別する。
- 旧来の組み込み単語帳（`n1_vocab`、`grammar_expression`、`name_reading`）はそのユーザーの通常の単語帳として移行し、名前は画面での従来の呼び名か、ユーザーが変更した名前を使う。実際に項目が入っているものだけを作る。
- 旧 `wordbooks.deck`（カテゴリの制限）は削除する。

#### `wordbook_stats`：単語帳の統計（読み取り専用ビュー、その場で計算）

件数の列は保存しない：知識項目の追加、削除、移動や毎回の復習で統計が変わるため、列に保存すると実際とずれやすい。ビューは必要なときに計算し、インデックス `knowledge_points(wordbook_rid, kind)`、`review_schedules(user_id, point_rid)` を使う。ユーザーあたり数百～数千件の知識項目なら、問い合わせはミリ秒単位で終わる。将来データが増えて遅くなったら、トリガーで維持する件数テーブルに変えればよく、API は変わらない。

全列（`rid`、`user_id`、日時列、外部キー、制約を含む）は付録 [`wordbook_stats`](#wordbook_stats) を参照。

### `knowledge_points`：知識項目（単語、文法、表現、名前など）（ユーザー別）

全列（`rid`、`user_id`、日時列、外部キー、制約を含む）は付録 [`knowledge_points`](#knowledge_points) を参照。

翻訳フィールド（`content_translations` に保存、`owner_table` はこのテーブル）：

| フィールド | 意味 | 言語（`language` 列） | 旧データの出所 |
|---|---|---|---|
| `meaning` | 語義 | ja：日本語の語義（国語辞典式）、ほかの 11 言語：翻訳の語義。言語ごとに 1 行 | `meaning_zh` → zh-Hans の行、`meaning_ja` → ja の行、接尾辞のない `meaning` は `meaning_zh` に統合 |
| `explanation` | 詳しい解説 | 12 言語のうち任意のもの、言語ごとに 1 行。旧データは zh-Hans のみ | `explanation_zh` → zh-Hans の行 |

ほかに翻訳が必要な文字は子テーブルに付く。本節末尾の「知識項目の翻訳フィールド一覧」を参照。

移行しないもの：`deck`（単語帳と `kind` に置き換え）、`level_confidence`（データなし）、`content_origin` / `verification_status`（知識項目ではすべて空）、`reference` / `reference_note`（旧番号）、`ruby_terms` / `japanese_annotations`（旧ふりがな、§9 参照）。

### 品詞

日本語の品詞には一般に 2 つの分け方がある：学校文法（日本の国語教育、10 品詞。動詞は五段、上一段・下一段、カ変、サ変）と日本語教育（外国人向け教材。形容詞はい / な形容詞、動詞はⅠ / Ⅱ / Ⅲグループ）で、両者は 1 対 1 に対応する。JLPT は 2010 年以降、品詞付きの語彙表を公開しておらず、問題と受験教材は一般に日本語教育の用語を使うため、後者を採用する。

名前（地名、人名など）は `kind = name` で区別し、品詞に「固有名詞」は設けない。名前の種類（地名、駅名、人名、作品名……）はタグとして記録する。文法類の知識項目には品詞がない。

| `pos` | 表示 | 学校文法 | 例 |
|---|---|---|---|
| `verb_1` | 動詞Ⅰグループ（五段） | 五段動詞 | 書く、飲む、帰る |
| `verb_2` | 動詞Ⅱグループ（一段） | 上一段・下一段動詞 | 食べる、見る |
| `verb_3_suru` | 動詞Ⅲグループ（する） | サ変動詞 | する、勉強する |
| `verb_3_kuru` | 動詞Ⅲグループ（来る） | カ変動詞 | 来る |
| `i_adjective` | い形容詞 | 形容詞 | 高い |
| `na_adjective` | な形容詞 | 形容動詞 | 静か |
| `noun` | 名詞 | 名詞（代名詞を含む） | 規制、概観 |
| `adverb` | 副詞 | 副詞 | かつて |
| `conjunction` | 接続詞 | 接続詞 | しかし |
| `adnominal` | 連体詞 | 連体詞 | あらゆる |
| `interjection` | 感動詞 | 感動詞 | ああ |
| `prefix` / `suffix` | 接頭辞 / 接尾辞 | 接頭語 / 接尾語 | 再～ / ～的 |
| `phrase` | 連語・句 | 連語 | 髪を切る |
| `idiom` | 慣用表現 | 慣用句 | 感銘を受ける |

### 活用と日本語の活用ルール集

活用形（ます形、て形、可能形……）は 1 件ずつ保存せず、「辞書形＋読み＋品詞」から**日本語の活用ルール集**を引いて生成する。ルール集はどのユーザーにも属さない全体共通の 2 つのテーブルである（列は付録 [`conjugation_forms`](#conjugation_forms)、[`conjugation_rules`](#conjugation_rules) を参照）：

- `conjugation_forms`：活用形の種類。動詞は dictionary、polite（ます形）、negative（ない形）、past（た形）、te（て形）、potential、passive、causative、causative_passive、volitional、conditional_ba、conditional_tara、imperative、prohibitive、形容詞は adverbial（副詞形）、attributive（連体形）など。
- `conjugation_rules`：1 件のルール＝品詞＋辞書形の語尾＋活用形 → 語尾を取った後に付ける部分。手順の説明も付ける（翻訳フィールド `step`、説明言語で表示できる）。

| 品詞 | 語尾 | 活用形 | 付ける部分 | 例 | 手順の説明 |
|---|---|---|---|---|---|
| verb_1 | く | te | いて | 書く → 書いて | 語尾のくをいに変え、てを付ける |
| verb_1 | む | te | んで | 読む → 読んで | 語尾のむをんに変え、でを付ける |
| verb_1 | む | polite | みます | 読む → 読みます | 語尾のむをみに変え、ますを付ける |
| verb_2 | る | negative | ない | 食べる → 食べない | るを取り、ないを付ける |
| verb_3_suru | する | potential | できる | 勉強する → 勉強できる | するをできるに変える |
| i_adjective | い | past | かった | 高い → 高かった | いを取り、かったを付ける |
| verb_1 | 行く | te | 行って | 行く → 行って | 例外：行くのて形は行って |
| verb_1 | ある | negative | ない | ある → ない | 例外：あるの否定はない |
| i_adjective | いい | past | よかった | いい → よかった | 例外：いいは活用するときよを使う |

生成時は**一致する最長の語尾**を使う：「行く」は「く」より長いので行くには例外ルール、書くには通常のルールが使われる。例外動詞（行く、ある、いらっしゃる・おっしゃる・なさる・くださる・ござる、問う・請う、いい／よい、ずる動詞など）は語尾が長いルールにすぎず、追加のコードも知識項目側での分類の保存も不要。語尾は表記と読みの両方と照合する（「行く」と「いく」で 1 件ずつ）。

ルール集のデータはフェーズ 1 で日本語教育の活用表をもとに整理して登録し、すべての品詞・すべての活用形をテストで確認する。

旧データで AI が書いた活用形と手順（`item_json.conjugations`、本番で 38 語。名前が polite / ます形、te / て形 / te_form などと混在）は移行しない。移行時にルールで生成した結果と 1 件ずつ比べ、一致しないものを移行レポートに書き出して、品詞やグループの付け間違い（五段の「帰る」を一段にしているなど）を見つける。旧 `knowledge_forms`、`knowledge_form_steps` のテーブルは作らない。

### 品詞の換算

旧 `part_of_speech` は AI が登録時に書いた自由記述で、本番の 496 件に約 110 通りの書き方がある（ユーザーのローカルデータベースにはさらに 30 通り以上）。4 種類の情報が混在しており、移行時にルールで分ける：

| 旧来の書き方に含まれる情報 | 例 | 行き先 |
|---|---|---|
| 主な品詞 | 名詞、動詞、ナ形容詞、形容動詞（ナ形容詞）、副詞、他动词（一段动词） | `pos`（中国語・日本語、簡体・繁体の書き方を統一） |
| 自他、サ変 | 動詞・他動詞、名詞・サ変動詞（自動詞） | `transitivity`、`is_suru_noun` |
| 活用グループ | （ワ行五段）、下一段活用、一段、および旧 `inflection_class`（godan / ichidan / suru / kuru / i_adjective / na_adjective） | `pos` に統合（godan → verb_1、ichidan → verb_2、suru → verb_3_suru または noun ＋ `is_suru_noun`、kuru → verb_3_kuru）。文字と `inflection_class` が矛盾するものは移行レポートに記載 |
| その他の説明 | 外来語、略語、四字熟語、時間名詞、副詞的用法、地名、駅名、人名、作品名、文法・様態などの文法機能、口語縮約・進行状態などの話し言葉の現象 | タグ（`knowledge_tags`） |

ルールで換算できない書き方は移行レポートに載せ、人が確認してから移行する。登録 API（REST、MCP）は列挙値だけを受け付け、自由記述は受け付けない。

### 知識項目の子テーブル

どれも `point_rid`（所属する知識項目。知識項目と一緒に削除）と `position`（元の配列での順序）を持つ。

全列は付録を参照：[`knowledge_examples`](#knowledge_examples)、[`knowledge_memory_points`](#knowledge_memory_points)、[`knowledge_patterns`](#knowledge_patterns)、[`knowledge_notes`](#knowledge_notes)、[`knowledge_comparisons`](#knowledge_comparisons)、[`knowledge_alternate_forms`](#knowledge_alternate_forms)、[`knowledge_related_words`](#knowledge_related_words)、[`knowledge_sources`](#knowledge_sources)。

### `knowledge_memory_images`：記憶用画像（知識項目ごと・言語ごとに 1 行）

記憶用画像には語義と例文訳が描かれている（[記憶用画像の基準](memory-image-standard.md) 参照）ため、言語ごとに生成する。プロンプト、生成状態、画像ファイルは 1 組なので 1 行にまとめ、`content_translations` には分けない。

全列（`rid`、`user_id`、日時列、外部キー、制約を含む）は付録 [`knowledge_memory_images`](#knowledge_memory_images) を参照。

主キーは `(point_rid, language)`。表示時はユーザーの説明言語の画像を使い、ない場合は言語のフォールバック順にほかの言語の画像を使い、「この言語の画像はまだありません」と表示する。本番では 4 件の知識項目にプロンプトがあり、それぞれ画像が 1 枚ある。

順序のない集合：

全列は付録を参照：[`knowledge_tags`](#knowledge_tags)、[`knowledge_question_kinds`](#knowledge_question_kinds)、[`knowledge_distractors`](#knowledge_distractors)、[`knowledge_source_drafts`](#knowledge_source_drafts)、[`knowledge_point_questions`](#knowledge_point_questions)。

### 知識項目の翻訳フィールド一覧

すべて `content_translations` に保存し、1 フィールドの言語ごとに 1 行（`language` 列）。旧データから移行した文字は zh-Hans のみ（`meaning` は ja もある）で、ほかの言語はユーザーの AI が MCP 経由で補う。

| `owner_table` | `field` | 内容 |
|---|---|---|
| `knowledge_points` | `meaning` | 語義 |
| `knowledge_points` | `explanation` | 詳しい解説 |
| `knowledge_examples` | `translation`、`spoken_translation`、`analysis`、`form_analysis` | 例文の訳、話し言葉の言い方の訳、例文の分析、形態分析 |
| `knowledge_memory_points` | `content` | 覚えるポイント |
| `knowledge_patterns` | `connection`、`meaning`、`example_translation` | 接続の説明、文型の意味、文型の例文の訳 |
| `knowledge_notes` | `title`、`body` | 補足説明のタイトルと本文（文体、試験のヒント、要点） |
| `knowledge_comparisons` | `difference` | 類義語の比較での違いの説明 |

翻訳テーブルに入らない日本語の原文は各テーブルの通常の列である：`expression`、`reading`、`paraphrase`、例文の `sentence`、文型の `pattern` など。記憶用画像は `knowledge_memory_images` 自身の `language` 列で言語ごとに分ける。

### 暗記カードのテンプレート

暗記カードは知識項目そのものの復習だけに使う：表を見て裏を思い出す。カテゴリごとにいくつかの固定テンプレートを用意し、ユーザーは単語・文法・名前ごとに 1 つ選ぶ（`user_card_templates`）。フィールドを 1 つずつ設定することはしない。テンプレートは全体共通のデータ（`card_templates`、`card_template_fields`）で、名前と説明は説明言語で表示できる。

| カテゴリ | テンプレート | 表 | 裏 | 向いている用途 |
|---|---|---|---|---|
| 単語 | 標準（既定） | 表記 | 読み、ローマ字、語義、例文 1 件（訳付き）、覚えるポイント 1 件、記憶用画像 | 日常の復習 |
| 単語 | シンプル | 表記 | 読み、語義 | 大量の単語を素早く確認 |
| 単語 | 例文 | 例文 1 件（訳なし） | 表記、読み、語義、例文の訳 | 文脈の中で語義を思い出す |
| 単語 | 日本語の語義 | 表記 | 読み、日本語の語義、言い換え、例文 1 件（訳なし） | 日本語で日本語を理解する。N2 以上向け |
| 文法 | 標準（既定） | 文型 | 接続、意味、例文 1 件（訳付き）、覚えるポイント 1 件 | 日常の復習 |
| 文法 | 例文 | 例文 1 件（訳なし） | 文型、意味、例文の訳、補足説明 1 件 | 文脈の中で文法を判断 |
| 文法 | 比較 | 文型 | 意味、類義語の比較最大 2 件、例文 1 件 | 混同しやすい文法 |
| 名前 | 標準（既定） | 表記 | 読み、ローマ字、説明 | |

- 裏には思い出すのに必要な内容だけを置き、例文や覚えるポイントなどは最大 1～2 件。詳しい解説や出典などは「詳細を見る」で表示する。
- 語義はユーザーの説明言語で表示し、ローマ字は `show_romaji` の設定に従う。
- 旧来のフィールドごとの設定（`memoryCardFrontFields` / `memoryCardBackFields`）は移行せず、移行後は既定のテンプレートを使う。
- 1 つの知識項目にカードは 1 枚だけで、復習の進み具合は引き続き知識項目ごとに記録する（`review_schedules`）。

**ほかの練習方法は問題の練習に入れ**、カードにはしない：漢字を見て読みを選ぶ、仮名を見て漢字を選ぶ、意味を見て語を選ぶ、などは問題バンクの対応する問題形式（漢字読み、表記、言い換え類義……）の問題である。問題の練習には 2 つの方法がある：

- **ランダム練習**：単語帳、問題形式、レベル、復習期限などの条件で問題バンクからランダムに出題する（`practice_sets.kind` = mixed、出題条件は `practice_set_filters`）。
- **AI によるカスタム練習**：MCP を通じて自分の AI に要望どおりの問題セットを作らせる（`practice_sets.kind` = topic。まず下書き `ai_drafts` を作り、レビュー後に公開する）。

全列は付録を参照：[`card_templates`](#card_templates)、[`card_template_fields`](#card_template_fields)、[`user_card_templates`](#user_card_templates)。

## 6. 問題バンク

### 統一データモデル：問題グループ → 小問 → 選択肢

JLPT の 23 の問題形式（[問題形式の仕様](question-type-specifications.md) 参照）の違いは 4 点に集約される：何問で 1 グループになり、どの素材を共有するか。問題文で出題箇所をどう示すか。選択肢がどんな形式か。問題を個別に抜き出せるか。v3 はすべての問題形式を 3 層に統一し、違いは全体共通の問題形式テーブル `question_types` で表して、形式ごとにテーブルを作らない：

```
question_types（問題形式のルール、全体共通）
      │ type_id
question_groups（問題グループ / 大問）──< question_group_materials >── materials（文章、お知らせ、画像、音声）
      │                                                                    └─< material_sentences（文単位と鍵となる文）
      └─< questions（小問）
                    ├─< question_marks（マーク：出題対象、空欄、★。問題文または素材本文に付ける）
                    ├─< question_options（選択肢、固定の番号）
                    ├─< question_explanation_sections（解説の段落：正解の根拠、手順、完全な答え、コツ、学習目標）
                    ├─< question_evidence（根拠箇所：問題文 / 素材本文 / 聴解スクリプト内の位置、選択肢ごとにも付けられる）
                    ├─< question_tags
                    └─< knowledge_point_questions >── knowledge_points（出題対象 / 前提知識 / 比較対象）
```

- **問題グループ（`question_groups`）**：同じ問題形式で、指示文と素材を共有する小問のまとまり。語彙・文法の単独問題は小問が 1 つだけのグループ。問題形式、状態、レベル、指示文、場面の説明、選択肢をシャッフルするかはグループに持つ。
- **素材（`materials`）**：文章、お知らせや表、画像、音声。1 つのグループで複数の素材を使え、`role` で区別する（本文、文章 A / B、お知らせ、場面の絵、音声）。音声は一部だけを切り出せる（`clip_start_ms`、`clip_end_ms`）。
- **小問（`questions`）**：問題文と、小問自身の音声や画像。すべての問題形式で小問の列は同じで、形式専用の列はない。
- **選択肢（`question_options`）**：固定の番号を持ち、正解は選択肢に印を付ける。文字、画像、音声のいずれでもよい。

#### 問題の定義：すべての問題形式で同じテーブルを使う

| 内容 | 保存先 | 問題形式ごとの使い方 |
|---|---|---|
| 指示文、場面 | `question_groups.instruction`、`context` | すべての形式 |
| 素材 | `question_group_materials` → `materials` | 読解：文章 / A・B の 2 つの文章 / お知らせ、聴解：音声、場面の絵、語彙・文法の単独問題：なし |
| 問題文 | `questions.prompt`、`prompt_media_rid` | 即時応答など音声だけの場合、問題文は音声 |
| マーク | `question_marks`：`kind` ＋開始・終了位置＋番号。問題文または素材本文に付ける | 漢字読み・表記・言い換え：target（下線）、語形成・文脈規定・文法形式：blank、文の組み立て：空欄ごとに slot を 1 件、★の空欄は star_slot、文章の文法：blank で文章の本文に付ける、読解・聴解・用法：マークなし |
| 選択肢 | `question_options`：文字またはメディア、`is_correct` | すべての形式。文の組み立ての 4 つの断片が選択肢で、正解は★の空欄に入る断片 |

問題形式テーブルの `question_types.target_marking` が形式ごとにどのマークが必要かを定め、入力時にそれに基づいて検証する。

#### 問題形式ごとの構造

| 問題形式 | グループ内の小問数 | 素材 | 選択肢 | グループ単位で出題 |
|---|---|---|---|---|
| 漢字読み、表記、語形成、文脈規定、言い換え類義、用法 | 1 | なし | 文字 | — |
| 文法形式の判断、文の組み立て | 1 | なし | 文字 | — |
| 文章の文法 | 複数 | 文章 1 つ（番号付きの空欄を含む） | 文字 | はい |
| 内容理解（短文 / 中文 / 長文）、主張理解 | 1～複数 | 文章 1 つ | 文字 | はい |
| 統合理解（読解） | 複数 | 文章 A、文章 B | 文字 | はい |
| 情報検索 | 複数 | お知らせや表 | 文字 | はい |
| 課題理解 | 1 | 音声 | 文字または画像 | はい |
| ポイント理解 | 1 | 音声 | 文字 | はい |
| 概要理解、即時応答 | 1 | 音声 | 音声のみ | はい |
| 発話表現 | 1 | 音声、場面の絵 | 音声のみ | はい |
| 統合理解（聴解） | 複数 | 音声 | 最初の 2 問は音声、3 問目は文字 | はい |
| 読解の基礎トレーニング、音の聞き分け | 1～複数 | 文章または音声 | 文字 | はい |
| ディクテーション | 1 | 音声 | なし（文字入力） | はい |
| シャドーイング、自由回答 | 1 | 音声 | なし | はい |

対象レベルは `question_type_levels` にある（`src/domain/questionContract.mjs` と一致）。問題形式の課題の説明と解答のコツは `question_types` の翻訳フィールド `task`、`tip` で、説明言語で表示できる。

全列は付録を参照：[`question_types`](#question_types)、[`question_type_levels`](#question_type_levels)、[`question_groups`](#question_groups)、[`question_group_materials`](#question_group_materials)、[`materials`](#materials)、[`material_sentences`](#material_sentences)、[`questions`](#questions)、[`question_options`](#question_options)、[`question_marks`](#question_marks)、[`question_explanation_sections`](#question_explanation_sections)、[`question_evidence`](#question_evidence)、[`question_tags`](#question_tags)。

旧 `kind`（練習の分類）と `type_id` は同じものの 2 つの呼び方で、中国語・日本語・英語が混在している（grammar 721 と 文法 568、kanji_to_kana 289 と 漢字読み 105 など）。移行時に `type_id` に統一して換算し、グループに保存する。`content_origin`、`verification_status` は問題ではすべて空なので移行しない。

### 解説：すべての問題形式で同じ構造

[問題形式の仕様](question-type-specifications.md) の共通契約に従い、解説は「正解の根拠、各選択肢の理由、根拠箇所、知識との関連、コツ」から成る。すべての問題形式で次の同じテーブルを使う：

| 内容 | 保存先 | 説明 | 旧データの出所（本番の件数） |
|---|---|---|---|
| 解説の段落 | `question_explanation_sections`：順序付きリストで、各段落は `kind` ＋翻訳フィールド `title`、`body`。フロントエンドは配列として 1 件ずつ表示 | `basis` 正解の根拠：なぜこの答えか | `explanation`（1,610 問）、`correctReason`（1,337 問）。同じ内容の 2 つの呼び方 |
| | | `step` 解き方の手順 | 読解問題の `explanation_nodes`（205 ステップ） |
| | | `full_answer` 完全な答え：並べ替え問題の完成文など | `full_order` |
| | | `tip` コツ：試験で素早く判断する方法 | `memoryPoint`（1,337 問） |
| | | `objective` 学習目標：この問題で何を練習するか | 下書きの問題の `learningObjective`（371 問） |
| 選択肢の理由 | `question_options` の翻訳フィールド `analysis` | 各選択肢がなぜ正しい / 誤りか | `choiceAnalysis[].explanation`（9,156）、聴解 `choice_details[].explanation`（178）、読解 `choice_explanations[].analysis`（108） |
| 誤答の種類 | `question_options.distractor_type` | 誤った選択肢がなぜ選ばれやすいか：本文と合わない、意味が近い、形が近い … | 読解問題の `errorType`（108） |
| 根拠箇所 | `question_evidence`：問題文 / 素材本文 / 聴解スクリプトの一部分。問題全体にも特定の選択肢にも付けられる | 答えの根拠が原文のどこにあるか | 読解問題の `choice_explanations[].evidence`（108） |
| 知識との関連 | `knowledge_point_questions`：`relation` = target / prerequisite / contrast | この問題がどの知識項目を出題対象・前提・比較対象とするか | 問題の `itemId` |
| 訳 | `questions` の翻訳フィールド `translation`、選択肢の翻訳フィールド `translation`、素材の翻訳フィールドと文ごとの訳 | 問題文、選択肢、文章、聴解スクリプトの訳 | `translationZh`（50）、選択肢の訳（286）、読解の全文訳と文ごとの訳（27 本） |

問題の `form_analysis_zh`（接続の判断。ローカルのデータに 71 問、本番のコピーにはなし）は、解き方の手順 `step`（見出し「接续判断」）として移行する。正解の根拠に同じ文がすでにあるものは重ねない。旧 `explanation` のうち言語の付いていない原文は、内容から言語を判断して書き込む。かなも漢字もない文（ES などの略語）は簡体字中国語とする。旧データの説明はすべて中国語の学習者向けに書かれているため。

### 選択肢と解答

全列は付録を参照：[`question_marks`](#question_marks)、[`question_options`](#question_options)、[`question_explanation_sections`](#question_explanation_sections)、[`question_evidence`](#question_evidence)、[`question_tags`](#question_tags)。

- **選択肢には固定の番号がある**：各選択肢の `rid` がその番号で、表示順によって変わらない。`position` は標準の順序（公式問題の 1–4）。
- **正解は選択肢に印を付ける**：`is_correct` = 1 で、1 問に 1 つだけ（一意インデックスで保証）。「何番目の選択肢か」で答えを表さない。
- **フロントエンドでのランダム表示**：グループの `shuffle_options` = 1 のとき、フロントエンドは選択肢の順序をシャッフルして表示する。選択肢が互いを参照する問題（「1と2の両方」など）や公式問題は 0 にし、`position` の順に表示する。
- **解答では選択肢の番号だけを記録する**：`attempt_answers.selected_option_rid`。採点は選んだ選択肢の `is_correct` を見るだけで、表示位置とは無関係。あわせて解答時に選んだ選択肢と正解の選択肢の文字（`selected_text`、`correct_text`）と正誤（`correct`）を保存する。問題を後で修正しても過去の記録の正誤と正答率は変わらず、選択肢が削除されても当時何を選んだかがわかる。
- **文の組み立て（並べ替え問題）**：4 つの断片が 4 つの選択肢で、正解は★の空欄に入る断片（`is_correct`）。空欄と★の空欄は問題文上のマーク（`question_marks`）で、完成文は解説の段落 `full_answer` に書く。
- **選択肢が音声の中で読み上げられる問題**（即時応答、概要理解、発話表現、聴解の統合理解の最初の 2 問）：選択肢には文字もファイルもなく、番号だけを表示する。必要なら読み上げられた内容を `text` に書き起こしとして書いてよい。
- **位置**：マークと根拠の `start_offset`、`end_offset` は UTF-16 の位置で、JavaScript の文字列の添字と同じ（`text.slice(start, end)`）。

問題と素材は直接修正し、過去の版は保存しない。過去の練習を見返すと、問題文と解説は修正後の最新の内容を表示し、正誤は解答時に保存したものに従う。将来、試験を厳密に固定する必要が出たら（正式な模擬試験など）、そのときに版のテーブルを導入する。

聴解の問題番号 `library_number` は移行せず、聴解問題は新しい番号 QL の順に並べる。

### 検証ルール：問題形式ごとに定義し、すべての端末で共有する

問題形式によって必要なものが違う：選択問題には正解の選択肢と解説が必要。ディクテーションには選択肢がなく、答えは参照用の文。シャドーイングは録音だけで、答えも解説もない。公式の聴解問題は解説を省略してよい。そこで検証ルールは問題形式ごとに定義し、コードに書き込まずにデータとして保存する。

**解答方式**（`question_types.answer_mode`）

| 解答方式 | 意味 | 問題形式 |
|---|---|---|
| `choice` | 選択。正解の選択肢が 1 つある | すべての公式問題形式、読解の基礎トレーニング、音の聞き分け |
| `text_input` | 文字入力。参照解答（`questions.expected_text`）と比較し、解答記録は `attempt_answers.answer_text` に保存 | ディクテーション |
| `recording` | 録音。正誤は判定しない。解答記録は `attempt_answers.recording_rid` と結び付ける | シャドーイング |
| `none` | 解答なしまたは自由回答。採点しない | 自由回答 |

旧「聴解の基礎トレーニング」は 4 つの問題形式に分ける：音の聞き分け `listening-basic-discrimination`、ディクテーション `listening-basic-dictation`、シャドーイング `listening-basic-shadowing`、自由回答 `listening-basic-free`。

**検証ルール**（`question_type_rules`：問題形式 × ルール → 必須 / 任意 / 禁止 / 警告のみ）

| ルール | 語彙、文法 | 読解（公式） | 聴解（公式） | 音の聞き分け | ディクテーション | シャドーイング、自由回答 |
|---|---|---|---|---|---|---|
| 問題文 `prompt` | 必須 | 必須 | 任意（音声だけでもよい） | 任意 | 任意 | 任意 |
| 選択肢 `options` | 必須 4 つ | 必須 4 つ | 必須 4 つ（即時応答・発話表現は 3 つ） | 必須、2 つ以上 | 禁止 | 禁止 |
| 正解の選択肢 `correct_option` | 必須 | 必須 | 必須 | 必須 | 禁止 | 禁止 |
| 参照解答 `expected_text` | 禁止 | 禁止 | 禁止 | 禁止 | 必須 | 禁止 |
| マーク `marks` | 形式による（下線、空欄、★） | 禁止（文章の文法を除く） | 禁止 | 禁止 | 禁止 | 禁止 |
| 素材 `materials` | 禁止（文章の文法は必須） | 必須 | 必須 | 必須 | 必須 | 必須 |
| 正解の根拠 `basis` | 必須 | 必須 | 任意 | 任意 | 任意 | 禁止 |
| 選択肢の理由 `option_analysis` | 必須 | 必須 | 任意 | 任意 | 禁止 | 禁止 |
| 根拠箇所 `evidence` | — | 警告のみ（推奨） | — | — | — | — |
| 自動チェック項目 | 誤答が知識項目にある、選択肢の重複、選択肢の長さ、出題対象が一意でない。漢字読みはさらに誤答が別の読みになっていないか、読み問題の選択肢の形式 | 選択肢の長さ | 選択肢の長さ | 選択肢の長さ | — | — |

各問題形式の完全なルールは `question_type_rules` のデータに従う（26 形式、261 件）。

**すべての端末で同じ検証プログラムを使う**

- 検証プログラムは `src/domain/`（JS）に 1 つだけ書き、`question_type_rules` のデータで動かす。
- サーバー：REST、MCP が問題を書き込むときに実行する。必須 / 禁止を満たさなければ書き込みを拒否し、警告のみのルールはレビューの指摘として書き込む。最終判断はサーバーが行う。
- Web：問題の追加 / 編集フォームは同じモジュールを直接読み込み、入力中に同じエラーを表示するので、送信前にわかる。
- iOS：別に実装せず、サーバーの検証専用 API `POST /api/questions/validate`（保存しない）を呼ぶ。
- AI：送信前に MCP ツール `validate_question` で確認できる。
- ルールは `GET /api/question-types` でクライアントに配布し、フォームは問題形式に応じて入力欄を表示・非表示にする（たとえばシャドーイング問題では選択肢と解説の入力欄を出さない）。

### 問題のレビュー：AI エージェントが判断する

構造の検証で保証できるのは問題の「形式が正しい」ことだけで、誤答の質（誤答も実は正しい、あり得なさすぎる、選択肢の長さが明らかに不揃いなど）は保証できない。各問題グループは作成・修正のたびに次の流れを通り、レビューの結論は AI エージェント自身が判断する：**AI のレビューに通れば使用可となり、学習者の確認は不要。**

```
AI が出題 ──▶ ① 必須チェック ──不合格──▶ 書き込みを拒否し、エラー一覧を出題した AI に返す
               │合格
               ▼
            ② 自動チェック（警告のみ）──▶ 状態 needs_review
               ▼
            ③ AI のレビュー（get_question_review_context → submit_question_review）
               ├─ pass   ──▶ ready（使用可）
               ├─ revise ──▶ needs_revision ──▶ 出題した AI が指摘に従って修正 ──▶ ① に戻る
               └─ reject ──▶ retired（停止）
            ④ 公開後：解答の統計や学習者の「問題を報告」──▶ needs_review に戻る
```

**① 必須チェック**（書き込み時。不合格なら拒否）：問題形式ごとに `question_type_rules` の「必須」と「禁止」のルールを実行する（前節参照）。さらにすべての形式で次を確認する：選択肢の文字が互いに異なる、根拠箇所の位置が原文の範囲内で引用が一致する、レベルが問題形式の対象レベルに含まれる。

**② 自動チェック**（サーバーが実行。ルールが「警告のみ」の形式にだけ行い、`question_review_findings` に reviewer = system で書き込む）

| チェック項目 | 内容 |
|---|---|
| `distractor_in_knowledge` | 誤答が関連する知識項目の別の表記、関連語、類義語の比較に出てくる。正解にもなり得る |
| `distractor_also_reading` | 読み問題：誤答が対象語のもう 1 つの有効な読みになっている |
| `reading_options_form` | 読み問題の選択肢がすべて仮名、表記問題の選択肢がすべて漢字を含む |
| `option_length_skew` | 正解の選択肢がほかより明らかに長い、または短い |
| `duplicate_options` | 同じ知識項目のほかの問題と選択肢がまったく同じ |
| `target_not_unique` | マークした出題対象が問題文に複数回出てくる |

**③ AI のレビュー**（MCP 経由）

- `get_question_review_context(group)`：問題グループ、素材、小問、選択肢、解説、②の警告、その問題形式のレビュー項目（[問題形式の仕様](question-type-specifications.md) の「構造の必須チェックと内容レビュー」「解説のテンプレート」から）を返す。
- AI は小問ごと・選択肢ごとに判断する：答えが一意か、各誤答が妥当か（紛らわしいが確かに誤り）、解説がすべての選択肢を説明しているか、問題文が自然か。
- `submit_question_review(group, verdict, summary, findings[])`：`question_reviews` と `question_review_findings` に書き込み、結論に応じてグループの状態を変える。
- 出題した AI に自分の問題をレビューさせず、別のセッションや別のエージェントでレビューすることを推奨する。`agent_label` にレビューした側を記録するので、同じエージェントが出題とレビューを両方行った場合はレビュー記録から見える。
- 修正が必要な場合、出題した AI は `list_questions_needing_revision` で問題とレビューの指摘を取得し、修正して再送信する。修正で解決した指摘は `resolved` にする。

**④ 公開後のフィードバック**

- 解答の統計：誰にも選ばれない誤答（弱すぎる）や、正解より多く選ばれる誤答（曖昧な可能性）があれば、自動で警告を作り、グループを needs_review に戻す。
- 学習者が練習中に「問題を報告」：reviewer = user のレビュー記録として残し、グループは needs_review に戻る。

移行してきた旧問題：練習で使われた問題はまず ready とし、移行後に AI がすべてのグループをもう一度レビューする。下書き内の問題は draft とする。

### 重複排除

移行時に**問題形式＋問題文**で重複を除く：

1. 旧データ内の問題のコピーすべて（知識項目に付属の問題、下書きの問題、練習の問題、スナップショット、読解問題、聴解問題）について公式問題形式 `type_id` を換算し、問題文を正規化する（前後の空白を除き、全角・半角と改行を統一）。
2. 問題形式と正規化した問題文の両方が同じものは同じ問題とみなし、小問（とそのグループ）を 1 つだけ作る。
3. 同じ問題のコピーのうち選択肢、答え、解説が異なるものは、最後に修正されたコピーをその問題の内容とし、ほかのコピーとの違いは移行レポートに書き出して人が確認する。
4. 問題文が同じでも素材（文章、音声）が異なる読解・聴解問題は統合しない。移行時に読解・聴解問題は文章 / 音声ごとにグループを作り、同じ文章の小問は同じグループにまとめる。ほかの問題は 1 問 1 グループ。
5. 移行時の一時的な対応表に旧問題の各コピーがどの新しい問題になったかを記録し、旧解答記録、練習、下書きをそれに従って新しい問題につなぐ。旧解答記録の答えは文字なので、文字で新しい問題の選択肢の番号に照合する。照合できないもの（内容の異なるコピーから来たもの）は `selected_option_rid` を空にし、当時の文字と正誤を残す。統合の状況は移行レポートに書き出す。

## 7. 練習、解答、復習

### `practice_sets`：練習（デイリー練習、テーマ別、総合、模擬試験）（ユーザー別）

全列（`rid`、`user_id`、日時列、外部キー、制約を含む）は付録 [`practice_sets`](#practice_sets) を参照。

翻訳フィールド（`content_translations` に保存、`owner_table` はこのテーブル）：`title` タイトル、`description` 説明、`disclaimer` 免責事項（「AI 生成、未確認」など）、`source_summary` 出題根拠の要約。

全列は付録を参照：[`practice_sections`](#practice_sections)、[`practice_set_entries`](#practice_set_entries)、[`practice_set_filters`](#practice_set_filters)、[`practice_set_filter_types`](#practice_set_filter_types)、[`practice_set_filter_statuses`](#practice_set_filter_statuses)。

### 解答

`practice_attempts`：1 回の練習の記録。（ユーザー別）

全列（`rid`、`user_id`、日時列、外部キー、制約を含む）は付録 [`practice_attempts`](#practice_attempts) を参照。

翻訳フィールド（`content_translations` に保存、`owner_table` はこのテーブル）：`title`。旧 `summary`（総問題数、正解数、正答率、所要時間）は保存せず、解答の行から計算する。

`attempt_answers`：練習中の各問題の解答。

全列（`rid`、`user_id`、日時列、外部キー、制約を含む）は付録 [`attempt_answers`](#attempt_answers) を参照。

`question_answer_states`：ユーザーごと・問題ごとの最新の解答。間違いノートと「解答済み」の状態に使う。（ユーザー別）

全列（`rid`、`user_id`、日時列、外部キー、制約を含む）は付録 [`question_answer_states`](#question_answer_states) を参照。

`learning_events`：学習イベントのログ。複数端末の同期での重複排除に使う（同じイベントは 1 回だけ数える）。（ユーザー別）

全列（`rid`、`user_id`、日時列、外部キー、制約を含む）は付録 [`learning_events`](#learning_events) を参照。

### 復習

`review_schedules`：知識項目ごとの復習の進み具合（間隔反復）。（ユーザー別）

全列（`rid`、`user_id`、日時列、外部キー、制約を含む）は付録 [`review_schedules`](#review_schedules) を参照。

`review_schedule_baselines`：列は上と同じ。iOS がオフラインで変更した復習の進み具合を同期するとき、サーバー上の進み具合が別の端末で変更されたかを判断するのに使う（3 方向マージの「共通の基準」）。

`memory_ratings`：カードの自己評価の記録。（ユーザー別）

全列（`rid`、`user_id`、日時列、外部キー、制約を含む）は付録 [`memory_ratings`](#memory_ratings) を参照。

**復習間隔の規則**（`src/domain/reviewSchedule.mjs`。サーバー・Web・iOS で共通）：正解・不正解の回数は保存しない。状態は間隔と復習回数で決まる——間隔 21 日以上かつ 4 回以上で習得、間隔 1 日以上で復習中、それ以外は学習中。

- 解答（問題が問う知識項目 `relation = target` だけ）：正解なら間隔を伸ばし（0 → 1 → 3 → 前回 × 易しさ）、易しさ +0.15。不正解なら間隔を 1 日に戻し、易しさ −0.2。期限前の正解は予定を進めない（早めの練習で間隔が伸びすぎない）。採点しない解答（シャドーイング、自由回答）は予定を変えない。
- カードの自己評価：初回は 忘れた 10 分・難しい 1 日・覚えた 3 日・簡単 7 日（旧版と同じ）。2 回目以降は前回の間隔から伸ばす（難しい ×1.2、覚えた ×易しさ、簡単 ×易しさ×1.3）。旧版は毎回固定の間隔で、間隔が伸びなかった。
- 同じイベント番号（`event_id`）は一度だけ数える。番号が同じで内容が違う送信は拒否する。

## 8. AI の下書き、計画、日々のまとめ、受信箱、録音

### `ai_drafts`：AI が生成し確認を待つ練習の下書き（ユーザー別）

全列（`rid`、`user_id`、日時列、外部キー、制約を含む）は付録 [`ai_drafts`](#ai_drafts) を参照。

翻訳フィールド（`content_translations` に保存、`owner_table` はこのテーブル）：`title` タイトル、`description` 説明、`next_step` 次のステップの提案。

全列は付録を参照：[`ai_draft_objectives`](#ai_draft_objectives)、[`ai_draft_sections`](#ai_draft_sections)、[`ai_draft_questions`](#ai_draft_questions)、[`ai_draft_comments`](#ai_draft_comments)。

### `learning_plans`：学習計画（1 ユーザー 1 件）（ユーザー別）

全列（`rid`、`user_id`、日時列、外部キー、制約を含む）は付録 [`learning_plans`](#learning_plans) を参照。

翻訳フィールド（`content_translations` に保存、`owner_table` はこのテーブル）：`fixed_schedule` 固定の日程の説明、`supplemental_needs` 追加の要望、`phase_strategy` 段階ごとの方針、`post_material_strategy` 教材を終えた後の方針、`goal` 目標。

全列は付録を参照：[`learning_plan_materials`](#learning_plan_materials)、[`learning_plan_tasks`](#learning_plan_tasks)、[`learning_plan_phases`](#learning_plan_phases)、[`learning_plan_phase_points`](#learning_plan_phase_points)。

### `daily_reports`：日々の学習のまとめ（ユーザー別）

全列（`rid`、`user_id`、日時列、外部キー、制約を含む）は付録 [`daily_reports`](#daily_reports) を参照。

翻訳フィールド（`content_translations` に保存、`owner_table` はこのテーブル）：`summary` まとめの本文。

全列は付録を参照：[`daily_report_points`](#daily_report_points)、[`daily_report_confusions`](#daily_report_confusions)、[`daily_report_confusion_points`](#daily_report_confusion_points)、[`daily_report_confusion_questions`](#daily_report_confusion_questions)、[`daily_report_recommendations`](#daily_report_recommendations)、[`daily_report_wrong_answers`](#daily_report_wrong_answers)。

### `inbox_captures`：受信箱（学習中にメモした、整理待ちの内容）（ユーザー別）

全列（`rid`、`user_id`、日時列、外部キー、制約を含む）は付録 [`inbox_captures`](#inbox_captures) を参照。

### `speaking_recordings`：シャドーイング録音（ユーザー別）

全列（`rid`、`user_id`、日時列、外部キー、制約を含む）は付録 [`speaking_recordings`](#speaking_recordings) を参照。

翻訳フィールド（`content_translations` に保存、`owner_table` はこのテーブル）：`summary` 分析のまとめ、`next_practice` 次の練習の提案。子テーブル `speaking_recording_notes`：`kind`（strength よかった点 / improvement 改善点）、翻訳フィールド `note`。`analysis_json.strengths[]`、`improvements[]` から。

### 市場：`market_shares`、`market_share_versions`、`market_imports`

全列は付録を参照：[`market_shares`](#market_shares)、[`market_share_versions`](#market_share_versions)、[`market_imports`](#market_imports)。

- **共有パッケージ（v2）**：ある時点の完全なスナップショットで、丸ごと JSON で保存する。構造は v3 の書き込みインターフェースと同じ——`knowledge`（知識項目の入力。単語帳と番号は含まない）、`groups`（題組の入力。小問の知識項目への関連はパッケージ内の位置 `index` で表す）、`media`（ファイル一覧）。共有者のファイル番号は別に保存し、取り込むときにサーバー上で取り込む人のファイルとして複製する。
- **公開**：自分の単語帳（WB1）または練習（DP3）から作る。「更新」は同じ共有元から新しい版を作り、古い版は残す。取り下げた共有は取り込めない。
- **取り込み**：取り込む人の単語帳（同名なら番号を付ける）、知識項目（`market_share_id` に出どころを記録）、題組を新しく作る。練習の共有ではテーマ別練習も作る。他人の問題は必ず審査を通す：問題形式の規則を満たすものは `needs_review`、満たさないものも取り込んだうえで `needs_revision` とし、違反した規則を審査の指摘（重大度 error）として残して AI が直す。同じ版を再び取り込むと前回の結果を返す（`market_imports`）。
- **移行**：旧形式の共有パッケージ（v1：旧項目 JSON と旧練習問題 JSON）は移行時に v2 に変換する。共有元の番号は対照表で WB / DP 番号に置き換える。旧の聴解共有（音声つき）は v1 形式ではないため移行せず、移行レポートに記録する。旧の取り込み記録は旧形式の結果なので移行しない。

## 9. 残さないもの

| 旧来の内容 | 扱い |
|---|---|
| 互換ビュー、`compat_pending`、INSTEAD OF トリガー、`json_*` ビュー | 削除 |
| `*_count`、`*_present`、`*_key`、`item_json_id`、重複した `json_*` 列、`text_language` | 削除 |
| `*_extra` テーブル（モデル化されていないフィールド） | 移行時に出てくるすべてのキーと回数を一覧にし、業務上の意味があるものは列を追加し、残りは移行レポートに書き出して捨てる |
| `deck`、組み込み単語帳 | 削除。§5 参照 |
| `level_confidence`（データなし）、`romaji_custom`（未使用。助詞の wa / e の書き方は検索キーで対応）、`inflection_class`（`pos` に統合）、`practice_question_count` / `practice_mode`（コードで未使用。問題数は `knowledge_point_questions` からその場で数える）、親子関係 `parent_reference` / `sub_items`（17 件、残さない） | 削除 |
| 問題の旧 `kind` | `type_id` に換算してから削除 |
| 復習の進み具合の旧 `correct` / `wrong` カウント（自己評価を含む）、自己評価の `count_semantics`（すべて legacy_mixed） | 捨てる。正答率は解答記録から計算する |
| `content_translations.legacy` | 削除。移行した文字は `origin = 'migrated'` |
| `review_items`（user_id = 0 の全体共通のサンプルデータ） | 移行せず、今後サンプルデータも提供しない |
| `ruby_terms`、`japanese_annotations`（旧来の単語ごとのふりがなと分かち書き） | 捨てる。移行レポートにふりがなが付いていた文字を一覧にし、後で AI が確認して必要なものを `ruby_annotations` で付け直す。iOS の分かち書きの色分けはオフラインの分かち書きを使う |
| マッピング仕様エンジン（`engine.mjs`、`specs.mjs`、`compat.mjs`） | 移行完了後に削除 |

## 10. API とクライアント

- REST、MCP、iOS の同期はすべて新しい構造に変える。外部には `code`（W12、QV15）で記録を示し、内部の文字列 ID は公開しない。
- 問題の API は「問題＋選択肢（固定の番号付き）」をまとめた構造を返し、練習の API はセクションと項目を返す。解答の API は選んだ選択肢の番号を送る。
- 多言語のフィールドは、選んだ説明言語の文字とフォールバックの情報（`{ text, language, isFallback, origin, verified }`）を返し、`*_zh` のフィールドは返さない。
- iOS の同期プロトコルのコレクションを新しいエンティティに変える。クライアントのローカルキャッシュはアップグレード後に消去して取り直す。
- MCP ツールの引数と戻り値の名前もあわせて変え（`item_id` → `code` など）、ツールの説明も更新する。
- 問題のレビュー用ツールを追加：`get_question_review_context`、`submit_question_review`、`list_questions_needing_revision`（§6「問題のレビュー」参照）。
- 検証を追加：MCP の `validate_question`、REST の `POST /api/questions/validate`（検証のみで保存しない）。`GET /api/question-types` で問題形式と検証ルールを配布する（§6「検証ルール」参照）。

## 10a. 問い合わせ方法と Cloudflare の制限

Cloudflare Workers（Durable Object の SQLite）の制限：1 文あたりのバインド変数は最大 100、式の入れ子の深さは 100 まで、1 文は 100KB まで、複合 SELECT の数に上限がある。データ層は次のルールで書く：

1. **ID や複数の検索条件は JSON の引数 1 つで渡し**、SQL の中で `json_each(?)` で展開する。`IN (?, ?, …)` とは書かない。引数の数は行数に依存しない。
2. **テーブル単位でまとめて問い合わせ、1 行ずつ問い合わせない**：詳細ページ＝本体のテーブル 1 回＋子テーブルごとに 1 回＋全翻訳 1 回。一覧ページ＝SQL 1 回（翻訳はウィンドウ関数で言語のフォールバック順に選ぶ）。
3. **SQL は平坦な行だけを返し、JSON は JS で組み立てる**。SQL の中で入れ子の `json_object` を使ってレコード全体を作らない（v2 はこれで式の深さの制限を超えた）。
4. **UNION でデータをつなげない**。まとめる必要がある出所はそれぞれ問い合わせる。
5. **一括書き込みは `INSERT … SELECT … FROM json_each(?)` を使い**、1 文につき JSON の引数 1 つ。

実測（本番データのコピー、ローカルの SQLite）：

| 場面 | 引数 | 所要時間 |
|---|---|---|
| 単語一覧：496 件＋言語のフォールバックで語義を選ぶ、SQL 1 回 | 2 | 2.6 ms |
| 知識項目の詳細：W5 と子テーブルの 10 行の全翻訳、SQL 1 回 | 2 | 0.03 ms |
| 全量同期：全 24,306 件の翻訳 | 0 | 29 ms |

`(owner_table, owner_rid)` での翻訳の検索は主キーのインデックスを使う。Durable Object の SQLite はコードと同じプロセスで動きネットワークの往復がないので、詳細ページの約 8 回の小さな問い合わせは合計 1 ms 未満で終わる。

## 11. 実装フェーズ

各フェーズの終わりに：ローカルのテストがすべて通り、Web と iOS の該当部分が使え、移行後のデータを 1 件ずつ確認する。

| フェーズ | 内容 | 確認 |
|---|---|---|
| 0 | 新しい DDL。元データから直接移行するスクリプト（旧テーブルを読み、新しいデータベースに書く）。移行レポート（種類ごとの件数、旧 ID → 新しい番号の対応、統合した問題、捨てたフィールド、見つからない参照） | 本番のコピーとユーザーのローカルデータベースをそれぞれ一度移行し、件数を照合し、外部キーの整合性を確認し、レポートですべての旧記録の行き先（移行済み、または捨てた理由）を確認する |
| 1 | 設定、単語帳、知識項目：サーバー、REST、MCP、Web。iOS は設定のみ | 知識項目 30 件の全フィールドを旧データと照合 |
| 2 | 問題バンク、素材、読解、聴解 | 問題形式ごとに抜き取り確認。問題形式＋問題文による重複排除の結果を人が確認 |
| 3 | 練習、解答、復習、学習イベント、統計 | 過去の成績、正答率、復習期限の件数が旧データと一致 |
| 4 | 下書き、計画、日々のまとめ、受信箱、録音、マーケットからの取り込み | 各機能を一通り操作 |
| 5 | iOS（項目・練習・復習・同期プロトコル）、Cloudflare Worker、v2 エンジンと互換コードの削除 | Cloudflare のテスト、iOS の全テスト |
| 6 | 本番の移行（別途承認が必要）：バックアップ → 移行 → 照合 → 切り替え | 照合が一致した場合だけ切り替える |

フェーズ 1～4 の間、アプリは「一部のモジュールだけ使える」状態で、ローカルのブランチでのみ開発し、デプロイしない。

実施状況（2026-10-10）：

| フェーズ | 状況 |
|---|---|
| 0–4 | 完了。サーバー、REST、MCP、Web、ブラウザー拡張、MCP App のビューは v3 だけを使う。旧エンジン（`storage.mjs` など）、旧クエリ層、旧 API、旧デモデータは削除済み。移行スクリプトと `scripts/v3/verify-*.mjs` が使える |
| 5 | Cloudflare は完了：Worker は v3 で動く（スキーマを一文ずつ作成、名前付きパラメーターの変換、R2 への書き込み、OAuth の表）。統合テストあり。オフライン同期 `GET /api/v3/sync` も用意済み。iOS のデータ層は v3 に移行済み（`apple/Sources/V3Bridge.swift`、[apple-v3-port.md](apple-v3-port.md)）。変換層は Swift 5.10 でコンパイルし、テストとローカルサーバーへの接続を確認済み。**画面側は Xcode でのビルドとテストがまだ必要** |
| 6 | 道具は用意済み、未実行：保守 API と `scripts/v3/cloud-migrate.mjs`（バックアップ → 移行 → 照合 → 新しいインスタンスへ取り込み → `DATABASE_NAME` で切り替え）。手順は [cloudflare-pages-deploy.md](cloudflare-pages-deploy.md)。本番での実行は別途承認が必要 |

v3 をデプロイすると、旧データを持つ本番インスタンスは読み取り専用で移行を待ち（リクエストは 503）、iOS は新しい版を Xcode でビルド・テストしてから配布する。

## 12. 確定した決定（2026-10-09）

1. **旧来のふりがなデータ**（`ruby_terms`、`japanese_annotations`）：捨てる。移行レポートにふりがなが付いていた文字を一覧にし、後で AI が一通り確認して、必要なものをオンデマンドのふりがな（`ruby_annotations`）で付ける。現在のデータは 1 ユーザー分だけ。
2. **全体共通のサンプルデータ `review_items`**：移行せず、今後サンプルデータも提供しない。
3. **復習の旧カウント**（`correct` / `wrong`、`count_semantics`）：捨てる。
4. **問題の重複排除**：問題形式＋問題文で重複を除く。ルールは §6「重複排除」。
5. **「N2関連」「N3関連」**：対応するレベルとして直接付ける（N2関連 → `jlpt_level_min` = `jlpt_level_max` = N2）。「非JLPT核心词」「生活词汇」は引き続きタグに変換する。
6. **知識項目の大分類 `kind`**：3 つだけにする：word 単語類（連語、慣用表現、表現のまとまりを含む）、grammar 文法類（話し言葉の音変化ルールを含む）、name 名前。番号の接頭辞は W / G / N。旧 `type` の細かい分類（phrase、listening_rule など）はタグに変換する。
7. **名前の種類**（地名、駅名、人名、作品名……）：タグを使い、品詞に「固有名詞」は設けない。
8. **活用の手順の説明**：品詞と語尾ごとのルールに統一し、全体共通の日本語の活用ルール集に入れる（§5「活用と日本語の活用ルール集」）。
9. **問題は版を持たない**：問題と素材は直接修正する。選択肢には固定の番号があり、正解は選択肢に印を付け、フロントエンドはランダムに並べてよく、解答は選択肢の番号と当時の文字・正誤を記録する（§6「選択肢と解答」）。
10. **統一データモデル**：すべての問題形式で「問題グループ → 小問 → 選択肢」と同じマーク・解説の構造を使う（§6）。
11. **暗記カードはテンプレート方式**：カテゴリごとに固定のテンプレートを用意し、ユーザーはテンプレートを選ぶだけ。ほかの練習方法は問題の練習（ランダム練習、AI によるカスタム練習）に入れる（§5「暗記カードのテンプレート」）。
12. **検証ルールは問題形式ごとに定義する**：ルールはデータ（`question_type_rules`）として保存し、サーバー、MCP、Web、iOS が同じ検証プログラムを使う（§6「検証ルール」）。
13. **問題のレビューは AI エージェントが判断する**：AI のレビューに通れば、学習者の確認なしで使用可になる（§6「問題のレビュー」）。

<!-- schema-doc:begin（以下は scripts/v3/schema-doc.mjs が server/v3/schema.sql から生成。手で編集しないこと） -->

## 付録：全テーブルの列

全テーブルの全列（内部主キー、所有ユーザー、日時列、外部キーを含む）。「必須」が空欄の列は NULL を許容します。「制約 / 参照」の → は外部キーです。「翻訳フィールド」はテーブルの列ではなく、`content_translations` に保存されます（§3 参照）。

### 1. 多言語

#### `languages`

サポートする言語

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `code` | TEXT | 必須 |  | 主キー | 言語コード（BCP 47）：ja、zh-Hans、en、zh-Hant、ko、vi、id、th、my、ne、es、fr | ja、zh-Hans、en、zh-Hant、ko、vi、id、th、my、ne、es、fr | 新規生成 |
| `native_name` | TEXT | 必須 |  |  | その言語自身での名称：简体中文、English | 简体中文、English |  |
| `fallback_code` | TEXT |  |  | → `languages.code`、参照中は削除不可 | この言語の文字がないときに先に探す言語。空なら zh-Hans に直接フォールバック | zh-Hant → zh-Hans、ko → en |  |
| `enabled` | INTEGER | 必須 | 1 | 値：0 / 1 | 設定画面で選択肢に出すか | 1 |  |
| `sort_order` | INTEGER | 必須 |  |  | 設定画面での並び順 |  |  |

#### `translatable_fields`

翻訳可能フィールドの登録表：どのテーブルのどのフィールドの文字を言語別に content_translations に保存するか

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `owner_table` | TEXT | 必須 |  |  | 文字が属する業務テーブル：knowledge_points | knowledge_points、meaning |  |
| `field` | TEXT | 必須 |  |  | フィールド名：meaning | knowledge_points、meaning |  |
| `description` | TEXT | 必須 |  |  | フィールドの意味：語義 | 語義（ja は日本語の語義） |  |
| `allows_ja` | INTEGER | 必須 | 0 | 値：0 / 1 | 日本語の行を許可するか（日本語の語義など）。説明文には通常日本語は不要 | 1 |  |
| `learner_visible` | INTEGER | 必須 | 1 | 値：0 / 1 | 学習者に表示するか。0 のものは AI の翻訳待ちリストに含めない | 1 |  |

テーブル制約：`PRIMARY KEY (owner_table, field)`

#### `content_translations`

すべての説明文：1 フィールドの言語ごとに 1 行

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `owner_table` | TEXT | 必須 |  |  | 文字が属するテーブル | knowledge_points、347 |  |
| `owner_rid` | INTEGER | 必須 |  |  | そのテーブルのどの行に属するか（rid） | knowledge_points、347 |  |
| `field` | TEXT | 必須 |  |  | その行のどのフィールドか（`translatable_fields` に登録が必要） | meaning |  |
| `language` | TEXT | 必須 |  | → `languages.code`、参照中は削除不可 | この行の文字の言語（FK → `languages.code`） | zh-Hans、en、ja |  |
| `text` | TEXT | 必須 |  |  | 文字の内容。空にできない | 概观、概览（中国語の文字） |  |
| `origin` | TEXT | 必須 |  | 値：migrated / manual / ai | 出所：旧データから移行 / ユーザーが編集 / AI が書き込み | migrated 旧データから移行 / manual ユーザーが編集 / ai AI が書き込み |  |
| `verified` | INTEGER | 必須 | 0 | 値：0 / 1 | 確認済みか。AI が書いたものは既定で未確認 | AI が書いたものは既定で 0 |  |
| `created_at` | TEXT | 必須 |  |  | 作成日時 |  | 旧テーブルの `created_at`。旧データにない場合は移行日時 |
| `updated_at` | TEXT | 必須 |  |  | 最終更新日時 |  | 旧テーブルの `updated_at`。旧データにない場合は移行日時 |

テーブル制約：`PRIMARY KEY (owner_table, owner_rid, field, language)`；`FOREIGN KEY (owner_table, field) REFERENCES translatable_fields(owner_table, field)`

インデックス `content_translations_language`：(language, owner_table, field)

#### `ruby_annotations`

オンデマンドのふりがな（Anki 記法：漢字[かな]）。位置の指定は翻訳と同じ。日本語原文の列は language = 'ja'

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `owner_table` | TEXT | 必須 |  |  | ふりがなを付けるテーブル | knowledge_examples、758、sentence、ja |  |
| `owner_rid` | INTEGER | 必須 |  |  | どの行か | knowledge_examples、758、sentence、ja |  |
| `field` | TEXT | 必須 |  |  | どのフィールドか（日本語原文の列、または翻訳可能フィールド） | knowledge_examples、758、sentence、ja |  |
| `language` | TEXT | 必須 |  | → `languages.code`、参照中は削除不可 | その文字の言語 | knowledge_examples、758、sentence、ja |  |
| `annotated_text` | TEXT | 必須 |  |  | ふりがな付きの文字（Anki 記法）：漢字の後に [読み]。漢字の前に別の文字が続くときは空白で範囲を区切る | 日本経済[にほんけいざい]の 歴史[れきし]を… |  |
| `created_by` | TEXT | 必須 |  | 値：ai / user | ふりがなを付けたのは誰か | ai / user |  |
| `created_at` | TEXT | 必須 |  |  | 作成日時 |  | 旧テーブルの `created_at`。旧データにない場合は移行日時 |
| `updated_at` | TEXT | 必須 |  |  | 最終更新日時 |  | 旧テーブルの `updated_at`。旧データにない場合は移行日時 |

テーブル制約：`PRIMARY KEY (owner_table, owner_rid, field, language)`

### 2. 番号とファイル

#### `id_sequences`

業務番号のカウンター：ユーザーごと・接頭辞ごとに採番し、削除後も番号は再利用しない

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `user_id` | INTEGER | 必須 |  | → `users.id`、連動して削除 | 所有ユーザー | 1、W | 旧テーブルの `user_id` |
| `prefix` | TEXT | 必須 |  |  | W、G、N、WB、QV、QG、QR、QL、MT、DP、TP、MX、AT、DR、DC、TK、RC、IN | 1、W |  |
| `next_no` | INTEGER | 必須 | 1 |  | 次に使う番号。削除後も番号は再利用しない | 331 |  |

テーブル制約：`PRIMARY KEY (user_id, prefix)`

#### `media_files`

画像と音声ファイル

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 必須 |  | 主キー | 内部主キー（自動採番の整数） |  | 新規生成 |
| `user_id` | INTEGER | 必須 |  | → `users.id`、連動して削除 | 所有ユーザー |  | 旧テーブルの `user_id` |
| `kind` | TEXT | 必須 |  | 値：image / audio | ファイルの種類 | image / audio | どの旧テーブルから来たか |
| `file_name` | TEXT |  |  |  | アップロード時の元のファイル名 | lesson3.mp3 | `listening_audio_assets.file_name` |
| `mime` | TEXT | 必須 |  |  | ファイル形式：audio/mpeg、image/png | audio/mpeg、image/png | `mime` |
| `size` | INTEGER | 必須 |  |  | バイト数 |  | `size` |
| `sha256` | TEXT | 必須 |  |  | 内容のハッシュ。重複排除と検証に使う |  |  |
| `storage_path` | TEXT | 必須 |  |  | ストレージ内のファイルのパス（ローカルディレクトリまたは R2 のキー） |  | `item_images.image_path`、`listening_audio_assets.audio_path` |
| `created_at` | TEXT | 必須 |  |  | 作成日時 |  | 旧テーブルの `created_at`。旧データにない場合は移行日時 |
| `updated_at` | TEXT | 必須 |  |  | 最終更新日時 |  | 旧テーブルの `updated_at`。旧データにない場合は移行日時 |

### 3. 設定

#### `user_preferences`

表示と練習の設定（1 ユーザー 1 行）

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `user_id` | INTEGER | 必須 |  | 主キー；→ `users.id`、連動して削除 | 所有ユーザー |  | 旧テーブルの `user_id` |
| `ui_language` | TEXT | 必須 | zh-CN | 値：zh-CN / ja / en | インターフェースの言語 | zh-CN / ja / en | `settings_json.locale` |
| `explanation_language` | TEXT | 必須 | zh-Hans | → `languages.code`、参照中は削除不可 | 語義と解説の言語 | 12 言語のいずれか。未設定ならインターフェースの言語から推定して書き込む | `settings_json.explanationLanguage` |
| `font_scale` | REAL | 必須 | 1 | 範囲 0.8–2.0 | 文字サイズの倍率 | 0.8–2.0（1） | `settings_json.fontScale`。旧来の段階値 `fontSize` しかない場合は換算 |
| `feedback_mode` | TEXT | 必須 | immediate | 値：immediate / batch | 1 問ごとに正誤を表示 / セット全体を終えてから表示 | immediate 1 問ごとに表示 / batch セット全体を終えてから表示（immediate） | `settings_json.feedbackMode` |
| `practice_navigation` | TEXT | 必須 | auto | 値：auto / manual | 解答後に自動 / 手動で次の問題へ | auto 自動 / manual 手動（auto） | `settings_json.practiceNavigation` |
| `auto_advance_seconds` | REAL | 必須 | 0.5 | 範囲 0–10 | 自動で進むまでの待ち秒数 | 0–10、小数第 1 位まで | `settings_json.practiceAutoAdvanceSeconds` |
| `show_review_ruby` | INTEGER | 必須 | 1 | 値：0 / 1 | 復習カードに読み仮名を表示 | はい / いいえ（はい） | `settings_json.showReviewRuby` |
| `show_explanation_ruby` | INTEGER | 必須 | 1 | 値：0 / 1 | 解説文に読み仮名を表示 | はい / いいえ（はい） | `settings_json.showExplanationRuby` |
| `show_romaji` | INTEGER | 必須 | 1 | 値：0 / 1 | 読みの横にローマ字を表示 | はい / いいえ（はい） | `settings_json.showRomaji` |
| `card_word_spacing` | INTEGER | 必須 | 1 | 値：0 / 1 | 暗記カードの日本語を単語ごとに区切る | はい / いいえ（はい） | `settings_json.memoryCardWordSpacing` |
| `segmented_display` | INTEGER | 必須 | 0 | 値：0 / 1 | 日本語の分かち書きと品詞の色分け | はい / いいえ | `settings_json.japaneseDisplay.segmented` |
| `daily_source_answers` | INTEGER | 必須 | 1 | 値：0 / 1 | デイリー練習の素材に最近の誤答を使うか | はい / いいえ | `settings_json.dailyPracticeSources.answers` |
| `daily_source_card_reviews` | INTEGER | 必須 | 1 | 値：0 / 1 | デイリー練習の素材に最近のカード自己評価を使うか | はい / いいえ | `settings_json.dailyPracticeSources.cardReviews` |
| `daily_source_window` | TEXT |  |  |  | 素材を取る期間の指定方法（値は実装時に確認） | 値は実装時に確認 | `settings_json.dailyPracticeSources.window` |
| `daily_source_hours` | INTEGER |  |  |  | 時間単位で素材を取るときの時間数 |  | `settings_json.dailyPracticeSources.hours` |
| `daily_source_time_zone` | TEXT |  |  |  | 「今日」を判断するタイムゾーン：Asia/Tokyo | Asia/Tokyo | `settings_json.dailyPracticeSources.timeZone` |
| `daily_source_run_at` | TEXT |  |  |  | 毎日練習を自動生成する時刻：07:00 | 07:00 | `settings_json.dailyPracticeSources.runAt` |
| `created_at` | TEXT | 必須 |  |  | 作成日時 |  | 旧テーブルの `created_at`。旧データにない場合は移行日時 |
| `updated_at` | TEXT | 必須 |  |  | 最終更新日時 |  | 旧テーブルの `updated_at`。旧データにない場合は移行日時 |

#### `user_card_templates`

ユーザーがカテゴリごとに選んだ暗記カードのテンプレート（未選択ならそのカテゴリの既定テンプレート）

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `user_id` | INTEGER | 必須 |  | → `users.id`、連動して削除 | 所有ユーザー |  | 旧テーブルの `user_id` |
| `kind` | TEXT | 必須 |  | 値：word / grammar / name | 知識項目の大分類 |  |  |
| `template_rid` | INTEGER | 必須 |  | → `card_templates.rid`、参照中は削除不可 | 選んだテンプレート |  | 旧 `memoryCardFrontFields` / `memoryCardBackFields`（フィールドごとの設定）は移行しない。移行後は各カテゴリの既定テンプレートを使う |
| `updated_at` | TEXT | 必須 |  |  | 最終更新日時 |  | 旧テーブルの `updated_at`。旧データにない場合は移行日時 |

テーブル制約：`PRIMARY KEY (user_id, kind)`

#### `user_question_kinds`

単語を登録するときに必ず付ける問題形式。空なら要求しない

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `user_id` | INTEGER | 必須 |  | → `users.id`、連動して削除 | 所有ユーザー |  | 旧テーブルの `user_id` |
| `type_id` | TEXT | 必須 |  | → `question_types.type_id`、参照中は削除不可 | 公式問題形式 ID：vocabulary-kanji-reading … |  | `settings_json.jlptVocabularyQuestionKinds[]` を公式問題形式に換算 |

テーブル制約：`PRIMARY KEY (user_id, type_id)`

#### `user_daily_source_ratings`

カードの自己評価のうち、どれをデイリー練習に選ぶか

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `user_id` | INTEGER | 必須 |  | → `users.id`、連動して削除 | 所有ユーザー |  | 旧テーブルの `user_id` |
| `rating` | TEXT | 必須 |  | 値：forgot / hard / remembered / easy |  |  | `settings_json.dailyPracticeSources.ratings[]` |

テーブル制約：`PRIMARY KEY (user_id, rating)`

#### `user_pos_styles`

分かち書き表示での品詞ごとの表示方法

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `user_id` | INTEGER | 必須 |  | → `users.id`、連動して削除 | 所有ユーザー |  | 旧テーブルの `user_id` |
| `pos` | TEXT | 必須 |  | 値：noun / verb / particle / adjective | 色分けする品詞のグループ |  | `settings_json.japaneseDisplay.styles` のキー |
| `mode` | TEXT | 必須 |  | 値：none / underline / text | 表示しない / 色付き下線 / 文字色 |  | `settings_json.japaneseDisplay.styles.<品詞>.mode` |
| `color` | TEXT | 必須 |  |  | 色：#326B9C |  | `settings_json.japaneseDisplay.styles.<品詞>.color` |

テーブル制約：`PRIMARY KEY (user_id, pos)`

#### `user_question_type_tips`

公式問題形式に対するユーザーの解答のコツ

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `user_id` | INTEGER | 必須 |  | → `users.id`、連動して削除 | 所有ユーザー |  | 旧テーブルの `user_id` |
| `type_id` | TEXT | 必須 |  | → `question_types.type_id`、参照中は削除不可 | 公式問題形式 ID |  | `settings_json.questionTypeTips` のキー |
| `tip` | TEXT | 必須 |  |  | コツの内容 |  | `settings_json.questionTypeTips` の値 |
| `created_at` | TEXT | 必須 |  |  | 作成日時 |  | 旧テーブルの `created_at`。旧データにない場合は移行日時 |
| `updated_at` | TEXT | 必須 |  |  | 最終更新日時 |  | 旧テーブルの `updated_at`。旧データにない場合は移行日時 |

テーブル制約：`PRIMARY KEY (user_id, type_id)`

#### `user_custom_tips`

ユーザーが作成した問題形式のコツ

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 必須 |  | 主キー | 内部主キー（自動採番の整数） |  | 新規生成 |
| `user_id` | INTEGER | 必須 |  | → `users.id`、連動して削除 | 所有ユーザー |  | 旧テーブルの `user_id` |
| `section` | TEXT | 必須 |  |  | 所属モジュール：vocabulary / grammar / reading / listening |  | `settings_json.customQuestionTypeTips[]`.section |
| `title` | TEXT | 必須 |  |  | コツのタイトル |  | `settings_json.customQuestionTypeTips[]`.title |
| `description` | TEXT |  |  |  | 適用場面の説明 |  | `settings_json.customQuestionTypeTips[]`.description |
| `tip` | TEXT | 必須 |  |  | コツの内容 |  | `settings_json.customQuestionTypeTips[]`.tip |
| `created_at` | TEXT | 必須 |  |  | 作成日時 |  | 旧テーブルの `created_at`。旧データにない場合は移行日時 |
| `updated_at` | TEXT | 必須 |  |  | 最終更新日時 |  | 旧テーブルの `updated_at`。旧データにない場合は移行日時 |

#### `user_speech_settings`

読み上げ設定（1 ユーザー 1 行）

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `user_id` | INTEGER | 必須 |  | 主キー；→ `users.id`、連動して削除 | 所有ユーザー |  | 旧テーブルの `user_id` |
| `provider` | TEXT | 必須 | browser |  | 音声サービス：browser（ブラウザ / システムの音声）または登録済みサービスの ID | browser（ブラウザ / システム内蔵の音声）または登録済みサービスの ID（browser） | `settings_json.ttsProvider` |
| `rate` | REAL | 必須 | 1 | 範囲 0.5–1.5 | 話す速さ | 0.5–1.5（1） | `settings_json.speech.rate` |
| `card_auto` | TEXT | 必須 | off | 値：off / front / back | 暗記カードの自動読み上げ：読まない / 表を表示したとき / 裏返したとき | off 読まない / front 表を表示したとき / back 裏返したとき（off） | `settings_json.speech.cardAuto` |
| `grammar_auto` | INTEGER | 必須 | 0 | 値：0 / 1 | 文法の詳細を開いたときに自動で読み上げる | はい / いいえ（いいえ） | `settings_json.speech.grammarAuto` |
| `include_example` | INTEGER | 必須 | 0 | 値：0 / 1 | 自動読み上げで例文も読む | はい / いいえ（いいえ） | `settings_json.speech.includeExample` |
| `created_at` | TEXT | 必須 |  |  | 作成日時 |  | 旧テーブルの `created_at`。旧データにない場合は移行日時 |
| `updated_at` | TEXT | 必須 |  |  | 最終更新日時 |  | 旧テーブルの `updated_at`。旧データにない場合は移行日時 |

#### `user_speech_voices`

音声サービスごとに選んだ声

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `user_id` | INTEGER | 必須 |  | → `users.id`、連動して削除 | 所有ユーザー |  | 旧テーブルの `user_id` |
| `provider` | TEXT | 必須 |  |  | 音声サービス ID |  | `settings_json.speech.voices` のキー |
| `voice` | TEXT | 必須 |  |  | 選んだ声 |  | `speech.voices.<provider>.voice` |
| `style` | TEXT |  |  |  | 話し方のスタイル（サービスが対応している場合） |  | `speech.voices.<provider>.style` |
| `role` | TEXT |  |  |  | 役柄（サービスが対応している場合） |  | `speech.voices.<provider>.role` |
| `created_at` | TEXT | 必須 |  |  | 作成日時 |  | 旧テーブルの `created_at`。旧データにない場合は移行日時 |
| `updated_at` | TEXT | 必須 |  |  | 最終更新日時 |  | 旧テーブルの `updated_at`。旧データにない場合は移行日時 |

テーブル制約：`PRIMARY KEY (user_id, provider)`

### 4. 単語帳と知識項目

#### `wordbooks`

単語帳：1 人のユーザーだけに属する。1 冊に単語・文法・名前を混在できる

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 必須 |  | 主キー | 内部主キー（自動採番の整数） | 1 | 新規生成 |
| `user_id` | INTEGER | 必須 |  | → `users.id`、連動して削除 | 所有ユーザー（FK → `users`）。単語帳は 1 人のユーザーだけに属し、他のユーザーからは見えない | 1 | `wordbooks.user_id`。組み込み単語帳から移行した単語帳は、項目が入っていたユーザーに属する |
| `code` | TEXT | 必須 |  |  | 単語帳の番号。ユーザーごとに WB1 から採番 | WB1 | 新規生成 |
| `title` | TEXT | 必須 |  |  | 単語帳の名前：N1 文法、IT词汇 | N1 文法、IT词汇 | `wordbooks.title`。ユーザーが名前を変えた場合は `wordbook_title_overrides.title` |
| `created_at` | TEXT | 必須 |  |  | 作成日時 |  | `wordbooks.created_at`、`updated_at` |
| `updated_at` | TEXT | 必須 |  |  | 最終更新日時 |  | `wordbooks.created_at`、`updated_at` |

テーブル制約：`UNIQUE (user_id, code)`；`UNIQUE (user_id, title)`

#### `knowledge_points`

知識項目：単語、連語、表現、文法、話し言葉の音変化ルール、固有名詞

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 必須 |  | 主キー | 内部主キー（自動採番の整数） |  | 新規生成 |
| `user_id` | INTEGER | 必須 |  | → `users.id`、連動して削除 | 所有ユーザー |  | 旧テーブルの `user_id` |
| `code` | TEXT | 必須 |  |  | 番号：word → W、grammar → G、name → N | W5、G3、N1 | 新規生成 |
| `wordbook_rid` | INTEGER | 必須 |  | → `wordbooks.rid`、参照中は削除不可 | 所属する単語帳（必須。知識項目がある単語帳は削除できない） |  | `item_json.wordbook_id`。空の場合は旧 `deck` から移行した単語帳に入れる |
| `kind` | TEXT | 必須 |  | 値：word / grammar / name | 大分類：単語類（連語・慣用表現を含む）/ 文法類（話し言葉の音変化ルールを含む）/ 名前（地名・人名などの固有名詞） | word 単語類 / grammar 文法類 / name 名前 | `item_json.type`：vocabulary、phrase、expression、phrase_set → word、grammar、listening_rule → grammar、proper_name → name（旧 `deck` とは無関係：「生活日语」で name_reading 単語帳を借りていた一般語は word）。細かい種類はタグに変換 |
| `expression` | TEXT | 必須 |  |  | 知識項目そのものの日本語表記：単語の漢字・仮名表記、文法の文型 | 概観、～を皮切りに | `item_json.original` |
| `reading` | TEXT |  |  |  | 仮名の読み：がいかん | がいかん | `item_json.reading` |
| `romaji` | TEXT |  |  |  | 読みから自動生成したローマ字（修正ヘボン式、長音は入力方式の書き方）。読みに漢字を含む場合は空 | gaikan、toukyou | 移行時に生成 |
| `romaji_key` | TEXT |  |  |  | ローマ字検索キー：小文字化、空白除去、長音をまとめるので tokyo / toukyou / tōkyō のどれでも一致 | gaikan、tokyo | 移行時に生成 |
| `pos` | TEXT |  |  | 値：verb_1 / verb_2 / verb_3_suru / verb_3_kuru / i_adjective / na_adjective noun / adverb / conjunction / adnominal / interjection / prefix / suffix phrase / idiom | 品詞。日本語教育の分類による固定の列挙値で、動詞の活用グループを含む。文法項目と音変化ルールは空 | verb_1、verb_2、verb_3_suru、verb_3_kuru、i_adjective、na_adjective、noun …。全一覧は下の「品詞」 | `item_json.part_of_speech` と `item_json.inflection_class` から換算。「品詞の換算」を参照 |
| `transitivity` | TEXT |  |  | 値：transitive / intransitive / both | 動詞の自他。固定の列挙値で、動詞以外は空 | transitive 他動詞 / intransitive 自動詞 / both 自他両用 | `part_of_speech` 中の 他動詞 / 自動詞 から |
| `is_suru_noun` | INTEGER | 必須 | 0 | 値：0 / 1 | 名詞に「する」を付けて動詞にできるか（「規制」→「規制する」）。名詞として記録し、活用はⅢグループ（する）で生成 | はい / いいえ | `part_of_speech` に サ変 を含む、または `inflection_class` が suru で原文が する で終わらない |
| `base_form` | TEXT |  |  |  | 辞書形：規制する | 規制 → 規制する | `item_json.base_form` |
| `jlpt_level_min` | TEXT |  |  | 値：N5 / N4 / N3 / N2 / N1 | レベル範囲の始まり（低いほうのレベル） | N2-N1 → min N2、max N1 | `item_json.jlpt_level` を分割：N1 → N1/N1、N2-N1 → N2/N1、「N2関連」→ N2/N2。「非JLPT核心词」「生活词汇」はタグに変換 |
| `jlpt_level_max` | TEXT |  |  | 値：N5 / N4 / N3 / N2 / N1 | レベル範囲の終わり（高いほうのレベル）。単一レベルなら始まりと同じ | N2-N1 → min N2、max N1 | `item_json.jlpt_level` を分割：N1 → N1/N1、N2-N1 → N2/N1、「N2関連」→ N2/N2。「非JLPT核心词」「生活词汇」はタグに変換 |
| `register_level` | TEXT |  |  | 値：written / spoken / formal / both | 文体。絞り込みに使う固定の列挙値で、文体の説明文は `knowledge_notes` にある | written 書き言葉 / spoken 話し言葉 / formal 改まった / both 汎用 | `item_json.register.level` |
| `paraphrase` | TEXT |  |  |  | 1～2 語の短い日本語の言い換え。「言い換え類義」問題の正解選択肢になり、日本語の語義と異なる必要がある。日本語の原文で翻訳しない | ～するとすぐに | `item_json.paraphrase_ja` |
| `source_sentence` | TEXT |  |  |  | 学習者がこの語に出会った日本語の原文（読んだ文章、聞いた文） | しかし東京では、岸壁という形で海に近づけるのは… | `item_json.source.sentence` のうち実際に文であるもの。書名・章の値は `knowledge_sources` に保存（下記参照） |
| `compile_note` | TEXT |  |  |  | 内部メモ：この知識項目をどの資料・どの会話から整理したか。翻訳せず、学習画面には表示しない | ユーザー提供の教材写真から例文と練習問題を整理 | `item_json.source.chat_summary` |
| `source_capture_rid` | INTEGER |  |  | → `inbox_captures.rid`、削除時に NULL | 受信箱のどの記録から整理したか |  | `item_json.source.capture_id` |
| `market_share_id` | TEXT |  |  |  | マーケットから取り込んだ知識項目の元の共有。自分で登録したものは空 |  | `user_review_items` から来た項目 |
| `captured_at` | TEXT | 必須 |  |  | 登録日時 | 2026-09-21T00:00:00+09:00 | `item_json.input_at`。ない場合は `captured_on` の日付 |
| `created_at` | TEXT | 必須 |  |  | 作成日時 |  | 旧テーブルの `created_at`。旧データにない場合は移行日時 |
| `updated_at` | TEXT | 必須 |  |  | 最終更新日時 |  | 旧テーブルの `updated_at`。旧データにない場合は移行日時 |

テーブル制約：`UNIQUE (user_id, code)`；`CHECK ((jlpt_level_min IS NULL) = (jlpt_level_max IS NULL))`

インデックス `knowledge_points_wordbook`：(wordbook_rid, kind)；インデックス `knowledge_points_romaji`：(user_id, romaji_key)；インデックス `knowledge_points_expression`：(user_id, expression)

翻訳フィールド（`content_translations.owner_table` = `knowledge_points`）：`meaning` 語義（ja は日本語の語義）（ja を含む）、`explanation` 詳しい解説

#### `knowledge_examples`

例文

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 必須 |  | 主キー | 内部主キー（自動採番の整数） |  | 新規生成 |
| `point_rid` | INTEGER | 必須 |  | → `knowledge_points.rid`、連動して削除 |  |  |  |
| `position` | INTEGER | 必須 |  |  | リスト内の順序（0 始まり） |  | 旧配列内の順序 |
| `sentence` | TEXT | 必須 |  |  | 日本語の例文 | 日本経済の歴史を概観する。 | `item_json.examples[]`.ja |
| `sentence_reading` | TEXT |  |  |  | 文全体の読み |  | `item_json.examples[]`.reading |
| `spoken_sentence` | TEXT |  |  |  | 話し言葉の言い方 |  | `item_json.examples[]`.spoken_ja |
| `target_reading` | TEXT |  |  |  | 文中の対象語の読み（活用によって読みが変わることがある） |  | `item_json.examples[]`.target_reading |
| `created_at` | TEXT | 必須 |  |  | 作成日時 |  | 旧テーブルの `created_at`。旧データにない場合は移行日時 |
| `updated_at` | TEXT | 必須 |  |  | 最終更新日時 |  | 旧テーブルの `updated_at`。旧データにない場合は移行日時 |

テーブル制約：`UNIQUE (point_rid, position)`

翻訳フィールド（`content_translations.owner_table` = `knowledge_examples`）：`translation` 例文の訳、`spoken_translation` 話し言葉の言い方の訳、`analysis` 例文の分析、`form_analysis` 例文の形態分析

#### `knowledge_memory_points`

覚えるポイント

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 必須 |  | 主キー | 内部主キー（自動採番の整数） |  | 新規生成 |
| `point_rid` | INTEGER | 必須 |  | → `knowledge_points.rid`、連動して削除 |  |  |  |
| `position` | INTEGER | 必須 |  |  | リスト内の順序（0 始まり） |  | 旧配列内の順序 |
| `created_at` | TEXT | 必須 |  |  | 作成日時 |  | 旧テーブルの `created_at`。旧データにない場合は移行日時 |
| `updated_at` | TEXT | 必須 |  |  | 最終更新日時 |  | 旧テーブルの `updated_at`。旧データにない場合は移行日時 |

テーブル制約：`UNIQUE (point_rid, position)`

翻訳フィールド（`content_translations.owner_table` = `knowledge_memory_points`）：`content` 覚えるポイント

#### `knowledge_patterns`

文型とコロケーション

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 必須 |  | 主キー | 内部主キー（自動採番の整数） |  | 新規生成 |
| `point_rid` | INTEGER | 必須 |  | → `knowledge_points.rid`、連動して削除 |  |  |  |
| `position` | INTEGER | 必須 |  |  | リスト内の順序（0 始まり） |  | 旧配列内の順序 |
| `pattern` | TEXT | 必須 |  |  | 文型またはコロケーション（日本語）：Vた＋とたん | Vた＋とたん | `item_json.patterns[]`.pattern |
| `example` | TEXT |  |  |  | 例文（日本語） |  | `item_json.patterns[]`.example |
| `created_at` | TEXT | 必須 |  |  | 作成日時 |  | 旧テーブルの `created_at`。旧データにない場合は移行日時 |
| `updated_at` | TEXT | 必須 |  |  | 最終更新日時 |  | 旧テーブルの `updated_at`。旧データにない場合は移行日時 |

テーブル制約：`UNIQUE (point_rid, position)`

翻訳フィールド（`content_translations.owner_table` = `knowledge_patterns`）：`connection` 文型の接続の説明、`meaning` 文型の意味、`example_translation` 文型の例文の訳

#### `knowledge_notes`

補足説明：タイトル＋本文のリスト（文体、試験のヒント、要点など）。フロントエンドは配列として 1 件ずつ表示

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 必須 |  | 主キー | 内部主キー（自動採番の整数） |  | 新規生成 |
| `point_rid` | INTEGER | 必須 |  | → `knowledge_points.rid`、連動して削除 |  |  |  |
| `position` | INTEGER | 必須 |  |  | リスト内の順序（0 始まり） |  | 旧配列内の順序 |
| `kind` | TEXT | 必須 |  | 値：register / exam_tip / key_point / other | 文体 / 試験のヒント / 要点 / その他 |  | `points[]` → key_point、`register.note_zh` → register、`register.exam_tip_zh` → exam_tip |
| `created_at` | TEXT | 必須 |  |  | 作成日時 |  | 旧テーブルの `created_at`。旧データにない場合は移行日時 |
| `updated_at` | TEXT | 必須 |  |  | 最終更新日時 |  | 旧テーブルの `updated_at`。旧データにない場合は移行日時 |

テーブル制約：`UNIQUE (point_rid, position)`

翻訳フィールド（`content_translations.owner_table` = `knowledge_notes`）：`title` 補足説明のタイトル、`body` 補足説明の本文

#### `knowledge_comparisons`

類義語の比較

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 必須 |  | 主キー | 内部主キー（自動採番の整数） |  | 新規生成 |
| `point_rid` | INTEGER | 必須 |  | → `knowledge_points.rid`、連動して削除 |  |  |  |
| `position` | INTEGER | 必須 |  |  | リスト内の順序（0 始まり） |  | 旧配列内の順序 |
| `target` | TEXT | 必須 |  |  | 比較対象（日本語）：開講 | 開講 | `item_json.comparisons[]`.target |
| `kind` | TEXT | 必須 | synonym | 値：synonym / everyday | 一般的な類義語 / 日常的な言い換え |  | `item_json.comparisons[]`.kind（空 → synonym） |
| `created_at` | TEXT | 必須 |  |  | 作成日時 |  | 旧テーブルの `created_at`。旧データにない場合は移行日時 |
| `updated_at` | TEXT | 必須 |  |  | 最終更新日時 |  | 旧テーブルの `updated_at`。旧データにない場合は移行日時 |

テーブル制約：`UNIQUE (point_rid, position)`

翻訳フィールド（`content_translations.owner_table` = `knowledge_comparisons`）：`difference` 違いの説明

#### `knowledge_alternate_forms`

別の表記

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 必須 |  | 主キー | 内部主キー（自動採番の整数） |  | 新規生成 |
| `point_rid` | INTEGER | 必須 |  | → `knowledge_points.rid`、連動して削除 |  |  |  |
| `position` | INTEGER | 必須 |  |  | リスト内の順序（0 始まり） |  | 旧配列内の順序 |
| `form` | TEXT | 必須 |  |  | 別の表記：捕える |  | `item_json.alternate_forms[]` |
| `created_at` | TEXT | 必須 |  |  | 作成日時 |  | 旧テーブルの `created_at`。旧データにない場合は移行日時 |

テーブル制約：`UNIQUE (point_rid, position)`

#### `knowledge_related_words`

関連語

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 必須 |  | 主キー | 内部主キー（自動採番の整数） |  | 新規生成 |
| `point_rid` | INTEGER | 必須 |  | → `knowledge_points.rid`、連動して削除 |  |  |  |
| `position` | INTEGER | 必須 |  |  | リスト内の順序（0 始まり） |  | 旧配列内の順序 |
| `word` | TEXT | 必須 |  |  | 関連語 |  | `item_json.related_words[]` |
| `created_at` | TEXT | 必須 |  |  | 作成日時 |  | 旧テーブルの `created_at`。旧データにない場合は移行日時 |

テーブル制約：`UNIQUE (point_rid, position)`

#### `knowledge_sources`

出典：辞書の項目、公式ウェブページ、教材の章

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 必須 |  | 主キー | 内部主キー（自動採番の整数） |  | 新規生成 |
| `point_rid` | INTEGER | 必須 |  | → `knowledge_points.rid`、連動して削除 |  |  |  |
| `position` | INTEGER | 必須 |  |  | リスト内の順序（0 始まり） |  | 旧配列内の順序 |
| `title` | TEXT | 必須 |  |  | 出典名：小学館 デジタル大辞泉、実力養成編 第1部 第2課 |  | `item_json.reference_sources[]`.title、`source.sentence` のうち書名・章の値 |
| `url` | TEXT |  |  |  | リンク。リンクのない教材は空 |  | `item_json.reference_sources[]`.url |
| `created_at` | TEXT | 必須 |  |  | 作成日時 |  | 旧テーブルの `created_at`。旧データにない場合は移行日時 |

テーブル制約：`UNIQUE (point_rid, position)`

#### `knowledge_memory_images`

記憶用画像：知識項目ごと・言語ごとに 1 行（画像にはその言語の語義と例文訳が描かれる）

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `point_rid` | INTEGER | 必須 |  | → `knowledge_points.rid`、連動して削除 | 所属する知識項目 |  |  |
| `language` | TEXT | 必須 |  | → `languages.code`、参照中は削除不可 | 画像内の文字（語義、例文訳）の言語 | zh-Hans、en | 旧データはすべて中国語で、zh-Hans として記録 |
| `concept` | TEXT |  |  |  | 画面の構想：どんな場面で覚えやすくするか |  | `item_json.mnemonic_image.concept` |
| `prompt` | TEXT |  |  |  | 画像生成に使うプロンプト（その言語向けに書く） | Japanese vocabulary mnemonic illustration for 規制… | `item_json.mnemonic_image.prompt` |
| `status` | TEXT | 必須 |  | 値：pending / prompt_ready / generated / approved | 生成待ち / プロンプト準備済み / 生成済み / 確認済みで使用可 | pending 生成待ち / prompt_ready プロンプト準備済み / generated 生成済み / approved 確認済みで使用可 | `mnemonic_image.status`（prompt_synced → prompt_ready。プロンプトがなく画像だけあるものは approved） |
| `media_rid` | INTEGER |  |  | → `media_files.rid`、削除時に NULL | アップロードした画像ファイル |  | `item_json.images[].id` |
| `url` | TEXT |  |  |  | 外部画像の URL（ファイルをアップロードしていない場合） |  | `item_json.images[].url` |
| `caption` | TEXT |  |  |  | 画像の説明（画像と同じ言語） |  | `item_json.images[].caption` |
| `created_at` | TEXT | 必須 |  |  | 作成日時 |  | 旧テーブルの `created_at`。旧データにない場合は移行日時 |
| `updated_at` | TEXT | 必須 |  |  | 最終更新日時 |  | 旧テーブルの `updated_at`。旧データにない場合は移行日時 |

テーブル制約：`PRIMARY KEY (point_rid, language)`

#### `knowledge_tags`

タグ

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `point_rid` | INTEGER | 必須 |  | → `knowledge_points.rid`、連動して削除 |  |  |  |
| `tag` | TEXT | 必須 |  |  | タグ：外来語、地名、生活词汇 |  | `item_json.tags[]`、`jlpt_level` のうちレベル以外の値、`part_of_speech` 中の補足情報 |
| `created_at` | TEXT | 必須 |  |  | 作成日時 |  | 旧テーブルの `created_at`。旧データにない場合は移行日時 |

テーブル制約：`PRIMARY KEY (point_rid, tag)`

#### `knowledge_question_kinds`

出題に向いた問題形式

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `point_rid` | INTEGER | 必須 |  | → `knowledge_points.rid`、連動して削除 |  |  |  |
| `type_id` | TEXT | 必須 |  | → `question_types.type_id`、参照中は削除不可 | 公式問題形式 ID |  | `item_json.question_kinds[]` を公式問題形式に換算 |

テーブル制約：`PRIMARY KEY (point_rid, type_id)`

#### `knowledge_distractors`

問題形式ごとの誤答選択肢

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `point_rid` | INTEGER | 必須 |  | → `knowledge_points.rid`、連動して削除 |  |  |  |
| `type_id` | TEXT | 必須 |  | → `question_types.type_id`、参照中は削除不可 | 公式問題形式 ID |  | `item_json.question_distractors` のキー（問題形式）を公式問題形式に換算 |
| `position` | INTEGER | 必須 |  |  | リスト内の順序（0 始まり） |  | `item_json.question_distractors{問題形式: [選択肢]}` |
| `choice` | TEXT | 必須 |  |  | 誤答選択肢の文字 |  | `item_json.question_distractors{問題形式: [選択肢]}` の選択肢 |

テーブル制約：`PRIMARY KEY (point_rid, type_id, position)`

#### `knowledge_source_drafts`

元になった下書き

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `point_rid` | INTEGER | 必須 |  | → `knowledge_points.rid`、連動して削除 |  |  |  |
| `draft_rid` | INTEGER | 必須 |  | → `ai_drafts.rid`、連動して削除 |  |  | `item_json.source.draft_ids[]` |

テーブル制約：`PRIMARY KEY (point_rid, draft_rid)`

#### `knowledge_point_questions`

知識項目と問題の関連（多対多。知識項目を削除しても問題は削除しない）

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `point_rid` | INTEGER | 必須 |  | → `knowledge_points.rid`、連動して削除 |  |  |  |
| `question_rid` | INTEGER | 必須 |  | → `questions.rid`、連動して削除 |  |  | `item_json.practice_questions[]` を問題バンクに移行した問題、問題の `itemId` |
| `relation` | TEXT | 必須 | target | 値：target / prerequisite / contrast | 出題対象 / 前提知識 / 比較対象 |  | 旧データには `itemId` の関連しかないため、移行時はすべて target とする |
| `position` | INTEGER | 必須 |  |  | リスト内の順序（0 始まり） |  | `item_json.practice_questions[]` を問題バンクに移行してから関連を作成、問題の `itemId` |

テーブル制約：`PRIMARY KEY (point_rid, question_rid)`

#### `wordbook_stats`（ビュー）

単語帳の統計（その場で計算し、件数は保存しない）

| 列 | 意味 |
|---|---|
| `wordbook_rid` |  |
| `total` | 知識項目の総数 |
| `word_count` | 単語類 |
| `grammar_count` | 文法類 |
| `name_count` | 名前 |
| `due_count` | 復習期限が来たもの |
| `new_count` | まだ学習していないもの |
| `mastered_count` | 習得済み |

### 4a. 暗記カードのテンプレート（全体共通。ユーザーはテンプレートを選ぶだけで、フィールドを個別に設定しない）

#### `card_templates`

暗記カードのテンプレート

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 必須 |  | 主キー | 内部主キー（自動採番の整数） |  | 新規生成 |
| `code` | TEXT | 必須 |  |  | テンプレートの番号：word_standard、grammar_example … |  | 新規生成 |
| `kind` | TEXT | 必須 |  | 値：word / grammar / name | 対象とする知識項目の大分類 |  |  |
| `is_default` | INTEGER | 必須 | 0 | 値：0 / 1 | そのカテゴリの既定テンプレートか |  |  |
| `sort_order` | INTEGER | 必須 |  |  | 表示順 |  |  |

一意インデックス `card_templates_one_default`：(kind) WHERE is_default = 1

翻訳フィールド（`content_translations.owner_table` = `card_templates`）：`name` 暗記カードのテンプレート名、`description` 暗記カードのテンプレートの説明

#### `card_template_fields`

テンプレートの表と裏に表示する内容

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `template_rid` | INTEGER | 必須 |  | → `card_templates.rid`、連動して削除 |  |  |  |
| `side` | TEXT | 必須 |  | 値：front / back | 表 / 裏 |  |  |
| `position` | INTEGER | 必須 |  |  | リスト内の順序（0 始まり） |  | 旧配列内の順序 |
| `field` | TEXT | 必須 |  | 値：expression / reading / romaji / meaning / meaning_ja / paraphrase example / pattern / memory_point / note / comparison / conjugation image / level / pos / tags | 表示する内容：表記 / 読み / ローマ字 / 語義（説明言語）/ 日本語の語義 / 言い換え / 例文 / 文型 / 覚えるポイント / 補足説明 / 類義語の比較 / 活用 / 記憶用画像 / レベル / 品詞 / タグ |  |  |
| `max_items` | INTEGER |  |  |  | リスト型の内容（例文、覚えるポイントなど）の最大表示件数。空ならすべて |  |  |
| `with_translation` | INTEGER | 必須 | 1 | 値：0 / 1 | 例文と文型に訳も表示するか |  |  |

テーブル制約：`PRIMARY KEY (template_rid, side, position)`

### 4b. 日本語の活用ルール集（全体共通。どのユーザーにも属さない）

#### `conjugation_forms`

活用形の種類

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 必須 |  | 主キー | 内部主キー（自動採番の整数） |  | 新規生成 |
| `code` | TEXT | 必須 |  |  | dictionary、polite、negative、past、te、potential、passive、causative、causative_passive、volitional、conditional_ba、conditional_tara、imperative、prohibitive、adverbial、attributive |  | 新規生成 |
| `label_ja` | TEXT | 必須 |  |  | 日本語教育での名称：ます形、ない形、て形、た形、可能形 … |  |  |
| `applies_to` | TEXT | 必須 |  | 値：verb / adjective / both | 動詞 / 形容詞 / 両方 に適用 |  |  |
| `sort_order` | INTEGER | 必須 |  |  | 表示順 |  |  |

翻訳フィールド（`content_translations.owner_table` = `conjugation_forms`）：`description` その活用形の使い方の説明

#### `conjugation_rules`

活用ルール：「品詞＋辞書形の語尾＋活用形」で置き換え方を引く。生成時は一致する最長の語尾を使うので、例外動詞は語尾が長いルールにすぎない：verb_1 + く + te → いて（書く → 書いて）、verb_1 + 行く + te → 行って、verb_1 + いく + te → いって、verb_1 + ある + negative → ない、verb_1 + いらっしゃる + polite → いらっしゃいます、i_adjective + いい + past → よかった

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 必須 |  | 主キー | 内部主キー（自動採番の整数） |  | 新規生成 |
| `pos` | TEXT | 必須 |  | 値：verb_1 / verb_2 / verb_3_suru / verb_3_kuru / i_adjective / na_adjective | 対象の品詞 |  |  |
| `ending` | TEXT | 必須 |  |  | 辞書形の語尾（表記と読みの末尾の両方と照合）：く、ぐ、る、する、くる、い、行く、ある … |  |  |
| `form_code` | TEXT | 必須 |  | → `conjugation_forms.code`、参照中は削除不可 | 活用形の種類 |  |  |
| `replacement` | TEXT | 必須 |  |  | 語尾を取った後に付ける部分：いて、って、ない、よかった |  |  |
| `is_exception` | INTEGER | 必須 | 0 | 値：0 / 1 | 例外かどうか（行く、ある、敬語動詞、問う、いい …） |  |  |

テーブル制約：`UNIQUE (pos, ending, form_code)`

翻訳フィールド（`content_translations.owner_table` = `conjugation_rules`）：`step` 活用の手順の説明

### 5. 問題バンク

#### `question_types`

問題形式（全体共通。src/domain/questionContract.mjs と一致）

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 必須 |  | 主キー | 内部主キー（自動採番の整数） |  | 新規生成 |
| `type_id` | TEXT | 必須 |  |  | 問題形式 ID：vocabulary-kanji-reading、grammar-composition、reading-integrated … |  |  |
| `module` | TEXT | 必須 |  | 値：vocabulary / grammar / reading / listening | 所属モジュール |  |  |
| `label_ja` | TEXT | 必須 |  |  | 日本語名：漢字読み、文の組み立て、統合理解 |  |  |
| `official` | INTEGER | 必須 |  | 値：0 / 1 | 1 = JLPT の公式問題形式、0 = 基礎トレーニング（公式試験のカバー率に含めない） |  |  |
| `target_marking` | TEXT | 必須 |  | 値：underline / blank / star / passage_blank / none | この形式で使うマーク（question_marks）：下線 / 括弧の空欄 / ★の並べ替え空欄 / 文章中の番号付き空欄 / なし。入力時の検証に使う |  |  |
| `option_media` | TEXT | 必須 |  | 値：text / text_or_image / audio / mixed / none | 選択肢の形式：文字 / 文字または画像 / 音声のみ / グループ内で混在（統合理解：最初の 2 問は音声、3 問目は文字）/ 選択肢なし |  |  |
| `material_kinds` | TEXT | 必須 |  | 値：none / passage / passage_pair / notice / audio / audio_image | 問題グループに必要な素材：なし / 文章 1 つ / A・B の 2 つの文章 / お知らせや表 / 音声 / 音声と場面の絵 |  |  |
| `draw_whole_group` | INTEGER | 必須 |  | 値：0 / 1 | 出題時にグループ全体をまとめて抜き出す必要があるか（1 文章複数問、統合理解などは 1） |  |  |
| `answer_mode` | TEXT | 必須 |  | 値：choice / text_input / recording / none | 解答方式：選択（正解の選択肢あり）/ 文字入力（ディクテーション、参照解答と比較）/ 録音（シャドーイング、正誤判定なし）/ 解答なしまたは自由回答（採点しない） |  |  |
| `sort_order` | INTEGER | 必須 |  |  | 表示順（JLPT の試験の順序に従う） |  |  |

翻訳フィールド（`content_translations.owner_table` = `question_types`）：`task` 問題形式の課題の説明：何を問うか、`tip` 問題形式の解答のコツ

#### `question_type_levels`

問題形式が対象とするレベル

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `type_id` | TEXT | 必須 |  | → `question_types.type_id`、連動して削除 |  |  |  |
| `level` | TEXT | 必須 |  | 値：N5 / N4 / N3 / N2 / N1 |  |  |  |

テーブル制約：`PRIMARY KEY (type_id, level)`

#### `question_type_rules`

問題形式ごとの検証ルール（形式ごと・ルールごとに 1 行）。サーバーの書き込み、MCP、Web のフォーム、iOS（サーバーの検証 API 経由）がすべてこのルールを使い、src/domain の同じ検証プログラムで実行する。

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `type_id` | TEXT | 必須 |  | → `question_types.type_id`、連動して削除 |  |  |  |
| `rule` | TEXT | 必須 |  | 値： prompt / options / correct_option / expected_text / marks / materials basis / option_analysis / evidence distractor_also_reading / reading_options_form / distractor_in_knowledge option_length_skew / duplicate_options / target_not_unique | ルール：問題文 / 選択肢 / 正解の選択肢 / 参照解答 / マーク / 素材 / 正解の根拠 / 選択肢の理由 / 根拠箇所 / および自動チェック項目（誤答が別の読みになっている、読み問題の選択肢の形式、誤答が知識項目にある、選択肢の長さの偏り、選択肢の重複、出題対象が一意でない） |  |  |
| `requirement` | TEXT | 必須 |  | 値：required / optional / forbidden / warn | 必須（満たさなければ書き込みを拒否）/ 任意 / 禁止 / 警告のみ（レビューの指摘として記録） |  |  |
| `value` | INTEGER |  |  |  | 数量ルールの値：選択肢はちょうどこの数でなければならない。空なら 2 つ以上 |  |  |

テーブル制約：`PRIMARY KEY (type_id, rule)`

#### `materials`

素材：文章、お知らせや表、画像、音声。複数の問題グループで共有できる（直接修正し、版は持たない）

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 必須 |  | 主キー | 内部主キー（自動採番の整数） |  | 新規生成 |
| `user_id` | INTEGER | 必須 |  | → `users.id`、連動して削除 | 所有ユーザー |  | 旧テーブルの `user_id` |
| `code` | TEXT | 必須 |  |  | 素材の番号：MT3 | MT3 | 新規生成 |
| `kind` | TEXT | 必須 |  | 値：passage / notice / image / audio | 文章 / お知らせや表 / 画像 / 音声 | passage 文章 / notice お知らせや表 / image 画像 / audio 音声 |  |
| `body` | TEXT |  |  |  | 文章・お知らせの日本語原文（お知らせ中の表は Markdown の表で書く）。文章の文法の空欄は（１）（２）…と書く |  | 読解問題の `passage` |
| `media_rid` | INTEGER |  |  | → `media_files.rid`、参照中は削除不可 | 画像または音声ファイル |  | 聴解問題の `audio_asset_id`、画像問題の画像 |
| `clip_start_ms` | INTEGER |  |  |  | 音声の切り出し開始位置（ミリ秒）。全体なら空 |  |  |
| `clip_end_ms` | INTEGER |  |  |  | 音声の切り出し終了位置（ミリ秒）。全体なら空 |  |  |
| `transcript` | TEXT |  |  |  | 聴解のスクリプト（日本語） |  | 聴解音声の `transcript` |
| `created_at` | TEXT | 必須 |  |  | 作成日時 |  | 旧テーブルの `created_at`。旧データにない場合は移行日時 |
| `updated_at` | TEXT | 必須 |  |  | 最終更新日時 |  | 旧テーブルの `updated_at`。旧データにない場合は移行日時 |

テーブル制約：`UNIQUE (user_id, code)`；`CHECK ((kind IN ('passage', 'notice') AND body IS NOT NULL) OR (kind IN ('image', 'audio') AND media_rid IS NOT NULL))`

翻訳フィールド（`content_translations.owner_table` = `materials`）：`title` 素材のタイトル（読解の文章、聴解の音声のタイトル）、`body_translation` 文章またはお知らせの全文訳、`transcript_translation` 聴解スクリプトの訳、`summary` 文章の要約、`structure` 文章の構成分析

#### `material_sentences`

素材の文単位（1 文ずつの対訳）

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 必須 |  | 主キー | 内部主キー（自動採番の整数） |  | 新規生成 |
| `material_rid` | INTEGER | 必須 |  | → `materials.rid`、連動して削除 |  |  |  |
| `position` | INTEGER | 必須 |  |  | リスト内の順序（0 始まり） |  | 旧配列内の順序 |
| `sentence` | TEXT | 必須 |  |  | 原文の 1 文 |  | 読解問題の `translation_lines_json[]`.ja |
| `is_key` | INTEGER | 必須 | 0 | 値：0 / 1 | 解答の鍵となる文か |  | その文が読解問題の `reading_analysis.keySentences[]` にある |

テーブル制約：`UNIQUE (material_rid, position)`

翻訳フィールド（`content_translations.owner_table` = `material_sentences`）：`translation` 1 文ずつの訳

#### `question_groups`

問題グループ（大問）：同じ問題形式で、指示文と素材を共有する小問のまとまり

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 必須 |  | 主キー | 内部主キー（自動採番の整数） |  | 新規生成 |
| `user_id` | INTEGER | 必須 |  | → `users.id`、連動して削除 | 所有ユーザー |  | 旧テーブルの `user_id` |
| `code` | TEXT | 必須 |  |  | 問題グループの番号：QS12 |  | 新規生成 |
| `type_id` | TEXT | 必須 |  | → `question_types.type_id`、参照中は削除不可 | 問題形式（モジュール、出題箇所の示し方、選択肢の形式を決める） | vocabulary-kanji-reading、grammar-form、reading-short | 問題の `questionTypeId`。ない場合は旧 `kind`（grammar、文法、kanji_to_kana、漢字読み …）から換算 |
| `status` | TEXT | 必須 |  | 値：draft / needs_review / needs_revision / ready / retired | 下書き / レビュー待ち / 要修正 / 使用可 / 停止。AI のレビューに通れば使用可 | draft / needs_review / needs_revision / ready / retired | 下書き内の問題は draft、練習で使われた問題は ready（移行後に AI がもう一度レビューする。移行レポート参照） |
| `official` | INTEGER | 必須 | 0 | 値：0 / 1 | 公式の過去問か | はい / いいえ | `official_jlpt_question` |
| `level` | TEXT |  |  | 値：N5 / N4 / N3 / N2 / N1 | JLPT のレベル。確認済みの値のみ | N1、空 | 旧データでは大半が空 |
| `instruction` | TEXT |  |  |  | 指示文（日本語）：＿＿＿の言葉の読み方として最もよいものを… | （　）に入る最もよいものを… | `instruction` |
| `context` | TEXT |  |  |  | 場面、役割、課題の条件（日本語）：男の人と女の人が話しています。… |  | `context` |
| `shuffle_options` | INTEGER | 必須 | 1 | 値：0 / 1 | 出題時に選択肢をシャッフルするか。選択肢が互いを参照する場合や公式問題は 0 |  | 新設：選択肢が他の選択肢を参照する場合（「1と2の両方」など）や公式問題は 0、それ以外は 1 |
| `source_reference` | TEXT |  |  |  | 出典（書名、章、URL など） |  | `source_reference` / `source` |
| `created_at` | TEXT | 必須 |  |  | 作成日時 |  | 旧テーブルの `created_at`。旧データにない場合は移行日時 |
| `updated_at` | TEXT | 必須 |  |  | 最終更新日時 |  | 旧テーブルの `updated_at`。旧データにない場合は移行日時 |

テーブル制約：`UNIQUE (user_id, code)`

翻訳フィールド（`content_translations.owner_table` = `question_groups`）：`instruction_translation` 指示文の訳、`context_translation` 場面説明の訳

#### `question_group_materials`

問題グループが使う素材

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `group_rid` | INTEGER | 必須 |  | → `question_groups.rid`、連動して削除 |  |  |  |
| `position` | INTEGER | 必須 |  |  | リスト内の順序（0 始まり） |  | 旧配列内の順序 |
| `material_rid` | INTEGER | 必須 |  | → `materials.rid`、参照中は削除不可 | 素材（問題グループで使用中は削除不可） |  |  |
| `role` | TEXT | 必須 |  | 値：main / passage_a / passage_b / notice / scene_image / audio | グループ内での役割：本文 / 文章 A / 文章 B / お知らせや表 / 場面の絵 / 音声 |  |  |

テーブル制約：`PRIMARY KEY (group_rid, position)`

#### `questions`

小問

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 必須 |  | 主キー | 内部主キー（自動採番の整数） |  | 新規生成 |
| `user_id` | INTEGER | 必須 |  | → `users.id`、連動して削除 | 所有ユーザー |  | 旧テーブルの `user_id` |
| `code` | TEXT | 必須 |  |  | 問題の番号：QV / QG / QR / QL + 番号（問題形式のモジュールによる） | QV15 | 新規生成 |
| `group_rid` | INTEGER | 必須 |  | → `question_groups.rid`、連動して削除 | 所属する問題グループ |  | 移行時に出所ごとにグループを作る：読解・聴解は文章 / 音声ごとにまとめ、それ以外は 1 問 1 グループ |
| `position` | INTEGER | 必須 |  |  | グループ内の順序（問1、問2 …） |  | 旧配列内の順序 |
| `prompt` | TEXT |  |  |  | 問題文（日本語）。即時応答など音声だけの問題は空 |  | `prompt`、`question`（旧来の書き方） |
| `prompt_media_rid` | INTEGER |  |  | → `media_files.rid`、参照中は削除不可 | 小問自身の音声や画像（聴解の各問の質問音声など） |  |  |
| `expected_text` | TEXT |  |  |  | 文字入力の問題（ディクテーション）の参照解答（日本語）。ほかの解答方式では空 |  | 旧データにディクテーション問題はなく、移行時は空 |
| `created_at` | TEXT | 必須 |  |  | 作成日時 |  | 旧テーブルの `created_at`。旧データにない場合は移行日時 |
| `updated_at` | TEXT | 必須 |  |  | 最終更新日時 |  | 旧テーブルの `updated_at`。旧データにない場合は移行日時 |

テーブル制約：`UNIQUE (user_id, code)`；`UNIQUE (group_rid, position)`；`CHECK (prompt IS NOT NULL OR prompt_media_rid IS NOT NULL)`

翻訳フィールド（`content_translations.owner_table` = `questions`）：`translation` 問題文の訳

#### `question_marks`

マーク：問題文または素材本文で示す位置（全問題形式共通）。漢字読み・表記・言い換え：target（下線）、語形成・文脈規定・文法形式：blank（括弧の空欄）、文の組み立て：空欄ごとに slot を 1 件、★の空欄は star_slot、文章の文法：blank で素材本文に付ける（material_rid が空でない）

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 必須 |  | 主キー | 内部主キー（自動採番の整数） |  | 新規生成 |
| `question_rid` | INTEGER | 必須 |  | → `questions.rid`、連動して削除 |  |  |  |
| `position` | INTEGER | 必須 |  |  | リスト内の順序（0 始まり） |  | 旧配列内の順序 |
| `kind` | TEXT | 必須 |  | 値：target / blank / slot / star_slot | 出題対象 / 括弧の空欄 / 並べ替えの空欄 / ★の空欄 |  | 問題形式ごとに換算：漢字読み・表記・言い換え → target、語形成・文脈規定・文法形式 → blank、文の組み立て → slot / star_slot、文章の文法 → blank（素材本文に付ける） |
| `material_rid` | INTEGER |  |  | → `materials.rid`、連動して削除 | どの素材の本文にあるマークか。空なら問題文にある |  | 文章の文法：グループの文章 |
| `start_offset` | INTEGER | 必須 |  |  | 開始位置（UTF-16 の位置。JavaScript の文字列の添字と同じ。0 始まり） |  | 移行時に問題文（または素材本文）で `promptTarget` / 空欄（　）/ ＿＿ の位置を探す。見つからない、または複数ある場合は移行レポートに記載 |
| `end_offset` | INTEGER | 必須 |  |  | 終了位置（その文字は含まない） |  | 同上 |
| `label` | TEXT |  |  |  | 表示する番号：（１）、★ |  | 問題文中の ★、（１）などの番号 |

テーブル制約：`UNIQUE (question_rid, position)`；`CHECK (end_offset >= start_offset)`

#### `question_options`

選択肢：rid は固定の番号で、正解は選択肢に印を付ける。フロントエンドは選択肢をランダムに並べてよく、解答では選んだ選択肢の番号だけを記録する

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 必須 |  | 主キー | 内部主キー（自動採番の整数） |  | 新規生成 |
| `question_rid` | INTEGER | 必須 |  | → `questions.rid`、連動して削除 |  |  |  |
| `position` | INTEGER | 必須 |  |  | 標準の順序（公式問題の 1–4）。シャッフルしない場合はこの順に表示 |  | `choices[]` の中の順序 |
| `text` | TEXT |  |  |  | 選択肢の文字（日本語）。画像・音声の選択肢では空でもよい。即時応答など選択肢が題組の音声の中で読み上げられるものは、文字もファイルも空でよい |  | `choices[]` |
| `media_rid` | INTEGER |  |  | → `media_files.rid`、参照中は削除不可 | 画像・音声の選択肢のファイル |  | 旧データに画像・音声の選択肢はなく、移行時は空 |
| `is_correct` | INTEGER | 必須 | 0 | 値：0 / 1 | 正解かどうか |  | `answerIndex` が指す選択肢。`answer` の文字しかない場合は選択肢の文字で照合。並べ替え問題は★の位置の断片 |
| `distractor_type` | TEXT |  |  |  | 誤答の種類（誤った選択肢がなぜ選ばれやすいか）：本文と合わない、意味が近い、形が近い … |  | 読解問題の `choice_explanations[].errorType`。ほかの問題形式は旧データになく空 |

テーブル制約：`UNIQUE (question_rid, position)`

一意インデックス `question_options_one_correct`：(question_rid) WHERE is_correct = 1

翻訳フィールド（`content_translations.owner_table` = `question_options`）：`analysis` 選択肢の分析：この選択肢がなぜ正しい / 誤りか、`translation` 選択肢の訳

#### `question_explanation_sections`

解説の段落：問題ごとの順序付きリスト（全問題形式共通）。フロントエンドは配列として 1 件ずつ表示

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 必須 |  | 主キー | 内部主キー（自動採番の整数） |  | 新規生成 |
| `question_rid` | INTEGER | 必須 |  | → `questions.rid`、連動して削除 |  |  |  |
| `position` | INTEGER | 必須 |  |  | リスト内の順序（0 始まり） |  | 旧配列内の順序 |
| `kind` | TEXT | 必須 |  | 値：basis / step / full_answer / tip / objective | 正解の根拠 / 解き方の手順 / 完全な答え（並べ替え問題の完成文など）/ コツ / 学習目標 |  | `explanation` / `correctReason` → basis、`memoryPoint` → tip、`learningObjective` → objective、読解の `explanation_nodes[]` → step、`full_order` → full_answer（本文は完成文） |

テーブル制約：`UNIQUE (question_rid, position)`

翻訳フィールド（`content_translations.owner_table` = `question_explanation_sections`）：`title` 解説の段落のタイトル、`body` 解説の段落の本文

#### `question_evidence`

根拠箇所：答えの根拠が原文のどこにあるか（全問題形式共通）。問題全体にも、特定の選択肢にも付けられる

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 必須 |  | 主キー | 内部主キー（自動採番の整数） |  | 新規生成 |
| `question_rid` | INTEGER | 必須 |  | → `questions.rid`、連動して削除 |  |  |  |
| `option_rid` | INTEGER |  |  | → `question_options.rid`、連動して削除 | どの選択肢に対するものか。空なら問題全体 |  | 読解問題の `choice_explanations[]` に対応する選択肢 |
| `position` | INTEGER | 必須 |  |  | リスト内の順序（0 始まり） |  | 旧配列内の順序 |
| `material_rid` | INTEGER |  |  | → `materials.rid`、連動して削除 | 根拠がどの素材にあるか。空なら問題文 |  |  |
| `source` | TEXT | 必須 |  | 値：prompt / body / transcript | 問題文 / 素材本文 / 聴解スクリプト |  | 読解問題は body、聴解問題は transcript |
| `start_offset` | INTEGER |  |  |  | 開始位置（UTF-16 の位置。JavaScript の文字列の添字と同じ）。引用だけで位置が特定できない場合は空 |  | 移行時に素材本文で引用の位置を探す。見つからなければ空 |
| `end_offset` | INTEGER |  |  |  | 終了位置（その文字は含まない） |  |  |
| `quote` | TEXT | 必須 |  |  | 原文の引用（日本語） |  | 読解問題の `choice_explanations[].evidence` |

テーブル制約：`UNIQUE (question_rid, position)`

#### `question_tags`

問題のタグ

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `question_rid` | INTEGER | 必須 |  | → `questions.rid`、連動して削除 |  |  |  |
| `tag` | TEXT | 必須 |  |  |  |  | 読解問題の `tags_json[]` |

テーブル制約：`PRIMARY KEY (question_rid, tag)`

#### `question_reviews`

問題のレビュー記録：レビュー 1 回につき 1 行（自動チェック、AI のレビュー、学習者からの問題報告をすべて記録）

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 必須 |  | 主キー | 内部主キー（自動採番の整数） |  | 新規生成 |
| `group_rid` | INTEGER | 必須 |  | → `question_groups.rid`、連動して削除 | レビュー対象の問題グループ（1 つの文章の複数問はまとめてレビュー） |  |  |
| `reviewer` | TEXT | 必須 |  | 値：system / ai / user | 自動チェック / AI エージェント / 学習者 |  | 新設。旧データにレビュー記録はない |
| `verdict` | TEXT | 必須 |  | 値：pass / revise / reject | 合格（グループは使用可になる）/ 要修正 / 不可（停止） |  |  |
| `agent_label` | TEXT |  |  |  | レビューした AI（MCP クライアント名など）。出題したエージェントとレビューしたエージェントを区別するため |  |  |
| `created_at` | TEXT | 必須 |  |  | 作成日時 |  | 旧テーブルの `created_at`。旧データにない場合は移行日時 |

インデックス `question_reviews_group`：(group_rid, created_at)

翻訳フィールド（`content_translations.owner_table` = `question_reviews`）：`summary` レビュー結論の説明

#### `question_review_findings`

レビューでの指摘：問題グループ全体、特定の小問、特定の選択肢のいずれかに付ける

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 必須 |  | 主キー | 内部主キー（自動採番の整数） |  | 新規生成 |
| `review_rid` | INTEGER | 必須 |  | → `question_reviews.rid`、連動して削除 |  |  |  |
| `question_rid` | INTEGER |  |  | → `questions.rid`、連動して削除 | どの小問に対するものか。空ならグループ全体 |  |  |
| `option_rid` | INTEGER |  |  | → `question_options.rid`、連動して削除 | どの選択肢に対するものか |  |  |
| `check_code` | TEXT | 必須 |  |  | チェック項目：distractor_also_correct、distractor_too_weak、option_length_skew …（設計書を参照） |  |  |
| `severity` | TEXT | 必須 |  | 値：error / warning / info | 修正必須 / 修正推奨 / 参考 |  |  |
| `resolved` | INTEGER | 必須 | 0 | 値：0 / 1 | 修正後に解決したか |  |  |
| `position` | INTEGER | 必須 |  |  | リスト内の順序（0 始まり） |  | 旧配列内の順序 |

テーブル制約：`UNIQUE (review_rid, position)`

翻訳フィールド（`content_translations.owner_table` = `question_review_findings`）：`message` 指摘内容と修正の提案

### 6. 練習、解答、復習

#### `practice_sets`

練習：デイリー練習、テーマ別、総合、模擬試験

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 必須 |  | 主キー | 内部主キー（自動採番の整数） |  | 新規生成 |
| `user_id` | INTEGER | 必須 |  | → `users.id`、連動して削除 | 所有ユーザー |  | 旧テーブルの `user_id` |
| `code` | TEXT | 必須 |  |  | 練習の番号：DP3、TP2、MX1 | DP3、MX1 | 新規生成 |
| `kind` | TEXT | 必須 |  | 値：daily / topic / mixed / mock | デイリー / テーマ別 / 総合 / 模擬試験 | daily デイリー練習 / topic テーマ別 / mixed 総合 / mock 模擬試験 | `daily_practices` は出所で区別、`mock_exams` は mock |
| `practice_date` | TEXT |  |  |  | 練習日 | 2026-09-24 | `daily_practices.practice_date` |
| `version` | INTEGER | 必須 | 1 |  | 同じ日の何版目か | 1 | `daily_practices.version` |
| `minutes` | INTEGER |  |  |  | 目安の時間（分） | 10 | `daily_practices.minutes` |
| `strategy` | TEXT |  |  | 値：approved_draft_full_set / agent_topic / targeted_by_history | 出題方法：確認済みの下書きをまとめて公開 / AI がテーマ別に出題 / 解答履歴に基づいて出題 | approved_draft_full_set 確認済みの下書きをまとめて公開 / agent_topic AI がテーマ別に出題 / targeted_by_history 解答履歴に基づいて出題 | `practice_json.strategy` |
| `level` | TEXT |  |  | 値：N5 / N4 / N3 / N2 / N1 | 模擬試験のレベル | N1 | `mock_exams.content_json.level` |
| `source_draft_rid` | INTEGER |  |  | → `ai_drafts.rid`、削除時に NULL | どの AI の下書きから公開したか |  | `practice_json.sourceDraftId` |
| `generated_at` | TEXT |  |  |  | AI が生成した日時 |  | `practice_json.generated_at` |
| `created_at` | TEXT | 必須 |  |  | 作成日時 |  | 旧テーブルの `created_at`。旧データにない場合は移行日時 |
| `updated_at` | TEXT | 必須 |  |  | 最終更新日時 |  | 旧テーブルの `updated_at`。旧データにない場合は移行日時 |

テーブル制約：`UNIQUE (user_id, code)`

翻訳フィールド（`content_translations.owner_table` = `practice_sets`）：`title` 練習のタイトル、`description` 練習の説明、`disclaimer` 免責事項、`source_summary` 出題根拠の要約

#### `practice_sections`

練習のセクション（模擬試験の各回もセクション）

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 必須 |  | 主キー | 内部主キー（自動採番の整数） |  | 新規生成 |
| `set_rid` | INTEGER | 必須 |  | → `practice_sets.rid`、連動して削除 |  |  |  |
| `position` | INTEGER | 必須 |  |  | リスト内の順序（0 始まり） |  | 旧配列内の順序 |
| `instruction` | TEXT |  |  |  | セクションの指示文（日本語） |  | `practice_json.sections[]`.instruction |
| `scheduled_date` | TEXT |  |  |  | 模擬試験のその回の予定日 |  | `mock_exams.content_json.sessions[]`.scheduledDate |
| `duration_minutes` | INTEGER |  |  |  | その回の制限時間（分） |  | `mock_exams.content_json.sessions[]`.durationMinutes |

テーブル制約：`UNIQUE (set_rid, position)`

翻訳フィールド（`content_translations.owner_table` = `practice_sections`）：`title` セクションのタイトル、`description` セクションの説明

#### `practice_set_entries`

練習に含まれる問題の項目

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 必須 |  | 主キー | 内部主キー（自動採番の整数） |  | 新規生成 |
| `set_rid` | INTEGER | 必須 |  | → `practice_sets.rid`、連動して削除 |  |  |  |
| `section_rid` | INTEGER |  |  | → `practice_sections.rid`、連動して削除 | 所属するセクション。セクションのない練習では空 |  |  |
| `position` | INTEGER | 必須 |  |  | リスト内の順序（0 始まり） |  | 旧配列内の順序 |
| `question_rid` | INTEGER | 必須 |  | → `questions.rid`、参照中は削除不可 | 問題（練習から参照されている間は削除不可） |  | `practice_json.questions[]`、`sessions[].questions[]` を問題バンクに移行した問題 |

テーブル制約：`UNIQUE (set_rid, position)`

#### `practice_set_filters`

テーマ別練習の出題条件

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `set_rid` | INTEGER | 必須 |  | 主キー；→ `practice_sets.rid`、連動して削除 |  |  |  |
| `wordbook_rid` | INTEGER |  |  | → `wordbooks.rid`、削除時に NULL | 単語帳を限定 |  | `practice_json.filters.wordbookId` |
| `jlpt_level` | TEXT |  |  | 値：N5 / N4 / N3 / N2 / N1 | レベルを限定 |  | `practice_json.filters.jlptLevel` |
| `only_due` | INTEGER | 必須 | 0 | 値：0 / 1 | 復習期限が来たものだけを出す |  | `practice_json.filters.onlyDue` |
| `question_count` | INTEGER |  |  |  | 出題数 |  | `practice_json.filters.count` |

#### `practice_set_filter_types`

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `set_rid` | INTEGER | 必須 |  | → `practice_sets.rid`、連動して削除 |  |  |  |
| `type_id` | TEXT | 必須 |  | → `question_types.type_id`、参照中は削除不可 | 限定する公式問題形式 |  | `practice_json.filters.kinds[]` を公式問題形式に換算 |

テーブル制約：`PRIMARY KEY (set_rid, type_id)`

#### `practice_set_filter_statuses`

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `set_rid` | INTEGER | 必須 |  | → `practice_sets.rid`、連動して削除 |  |  |  |
| `status` | TEXT | 必須 |  | 値：new / learning / review / mastered | 限定する記憶状態 |  | `practice_json.filters.statuses[]` |

テーブル制約：`PRIMARY KEY (set_rid, status)`

#### `practice_attempts`

練習記録（1 回の解答）

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 必須 |  | 主キー | 内部主キー（自動採番の整数） |  | 新規生成 |
| `user_id` | INTEGER | 必須 |  | → `users.id`、連動して削除 | 所有ユーザー |  | 旧テーブルの `user_id` |
| `code` | TEXT | 必須 |  |  | 練習記録の番号：AT12 | AT12 | 新規生成 |
| `set_rid` | INTEGER |  |  | → `practice_sets.rid`、削除時に NULL | どの練習を解いたか。その場で作った問題セットでは空 |  | `attempt.practiceId` |
| `kind` | TEXT | 必須 |  | 値：daily / vocabulary / grammar / reading / listening / mixed / mock | 練習の入口 | daily-practice / vocabulary / grammar / mixed | `attempt.view` |
| `is_active` | INTEGER | 必須 | 0 | 値：0 / 1 | 進行中の練習か（ユーザーごとに最大 1 件） | ユーザーごとに最大 1 件 | `practice_state.active_attempt_json` |
| `started_at` | TEXT | 必須 |  |  |  |  | `startedAt`、`completedAt` |
| `completed_at` | TEXT |  |  |  |  |  | `startedAt`、`completedAt` |
| `analysis_status` | TEXT | 必須 | idle | 値：idle / running / completed / failed | AI による練習分析の状態 | idle 未分析 / running / completed | `analysisStatus` |
| `analysis_started_at` | TEXT |  |  |  |  |  |  |
| `analysis_completed_at` | TEXT |  |  |  |  |  |  |
| `created_at` | TEXT | 必須 |  |  | 作成日時 |  | 旧テーブルの `created_at`。旧データにない場合は移行日時 |
| `updated_at` | TEXT | 必須 |  |  | 最終更新日時 |  | 旧テーブルの `updated_at`。旧データにない場合は移行日時 |

テーブル制約：`UNIQUE (user_id, code)`

一意インデックス `practice_attempts_one_active`：(user_id) WHERE is_active = 1

翻訳フィールド（`content_translations.owner_table` = `practice_attempts`）：`title` 練習記録のタイトル

#### `attempt_answers`

練習中の各問題の解答

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 必須 |  | 主キー | 内部主キー（自動採番の整数） |  | 新規生成 |
| `attempt_rid` | INTEGER | 必須 |  | → `practice_attempts.rid`、連動して削除 | 所属する練習記録 |  |  |
| `position` | INTEGER | 必須 |  |  | リスト内の順序（0 始まり） |  | `questionIds[]` の順序 |
| `entry_rid` | INTEGER |  |  | → `practice_set_entries.rid`、削除時に NULL | 練習のどの項目に対応するか |  |  |
| `question_rid` | INTEGER |  |  | → `questions.rid`、削除時に NULL | 問題。元の問題が削除された、または見つからない場合は空 |  | `questionManifest[]`、`questionIds[]` を重複排除の対応表で換算 |
| `status` | TEXT | 必須 |  | 値：answered / presented / missing_original | 解答済み / 表示したが未解答 / 元の問題が見つからない | answered 解答済み / presented 表示したが未解答 / missing_original 元の問題が見つからない | `questionManifest[].status`（本番では 1,910 件が missingOriginal） |
| `selected_option_rid` | INTEGER |  |  | → `question_options.rid`、削除時に NULL | 選んだ選択肢（固定の番号で、表示順とは無関係） |  | `answers[].selected`（文字）を当時の問題の選択肢の文字と照合 |
| `selected_text` | TEXT |  |  |  | 解答時に選んだ選択肢の文字（選択肢が後で修正・削除されても当時の選択がわかる） |  | `answers[].selected` |
| `correct_text` | TEXT |  |  |  | 解答時の正解選択肢の文字 |  | 移行時点の問題の正解選択肢の文字 |
| `correct` | INTEGER |  |  | 値：0 / 1 | 正解だったか |  | `answers[].correct`（当時の判定を保持し、再計算しない） |
| `answer_text` | TEXT |  |  |  | 文字入力の問題（ディクテーション）でユーザーが入力した文字 |  | 旧データに文字入力の解答はない |
| `recording_rid` | INTEGER |  |  | → `speaking_recordings.rid`、削除時に NULL | 録音の問題（シャドーイング）で提出した録音 |  | 旧データのシャドーイング録音は解答記録と結び付いておらず、移行時は空 |
| `started_at` | TEXT |  |  |  | 問題を見始めた日時 |  | `answers[]` の同名フィールド |
| `answered_at` | TEXT |  |  |  | 解答日時 |  | `answers[]` の同名フィールド |
| `elapsed_ms` | INTEGER |  |  |  | 所要時間（ミリ秒） |  | `answers[]` の同名フィールド |

テーブル制約：`UNIQUE (attempt_rid, position)`

#### `question_answer_states`

ユーザーごと・問題ごとの最新の解答（間違いノート、「解答済み」の状態）

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `user_id` | INTEGER | 必須 |  | → `users.id`、連動して削除 | 所有ユーザー |  | 旧テーブルの `user_id` |
| `question_rid` | INTEGER | 必須 |  | → `questions.rid`、連動して削除 | 問題 |  | `answers.question_id` を対応表で換算 |
| `selected_option_rid` | INTEGER |  |  | → `question_options.rid`、削除時に NULL | 最新の解答で選んだ選択肢 |  | `answers.selected` を問題の選択肢の文字と照合 |
| `selected_text` | TEXT |  |  |  | 最新の解答で選んだ選択肢の文字 |  | `answers.selected` |
| `correct` | INTEGER |  |  | 値：0 / 1 | 正解だったか |  | `answers.selected`、`correct` |
| `answered_at` | TEXT | 必須 |  |  | 解答日時 |  | `answers.answered_at` |
| `submission_state` | TEXT | 必須 |  | 値：submitted / draft | 提出済み / 未提出 | submitted 提出済み / draft 未提出（旧データの legacy_submitted は submitted とする） | `answers.submission_state` |
| `event_id` | TEXT |  |  |  | 対応する解答イベント |  | `answers.answer_event_id` |

テーブル制約：`PRIMARY KEY (user_id, question_rid)`

#### `learning_events`

学習イベントのログ（複数端末同期の重複排除：同じイベントは 1 回だけ数える）

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `user_id` | INTEGER | 必須 |  | → `users.id`、連動して削除 | 所有ユーザー |  | 旧テーブルの `user_id` |
| `event_id` | TEXT | 必須 |  |  | クライアントが生成したイベント ID |  |  |
| `event_type` | TEXT | 必須 |  | 値：AnswerSubmitted / MemoryRated | 解答 / カードの自己評価 | AnswerSubmitted 解答 / MemoryRated カードの自己評価 |  |
| `occurred_at` | TEXT | 必須 |  |  | 発生日時 |  |  |
| `received_at` | TEXT | 必須 |  |  | サーバーが受け取った日時 |  |  |
| `payload_hash` | TEXT | 必須 |  |  | イベント内容のハッシュ。重複送信の識別に使う |  |  |
| `question_rid` | INTEGER |  |  | → `questions.rid`、削除時に NULL | 関係する問題 |  |  |
| `point_rid` | INTEGER |  |  | → `knowledge_points.rid`、削除時に NULL | 関係する知識項目 |  |  |
| `selected_option_rid` | INTEGER |  |  | → `question_options.rid`、削除時に NULL | 選んだ選択肢（解答イベント） |  | `payload_json.selected` を問題の選択肢の文字と照合 |
| `selected_text` | TEXT |  |  |  | 選んだ選択肢の文字 |  | `payload_json.selected` |
| `correct` | INTEGER |  |  | 値：0 / 1 |  |  |  |
| `type_id` | TEXT |  |  | → `question_types.type_id`、参照中は削除不可 | 問題形式 |  |  |
| `rating` | TEXT |  |  | 値：forgot / hard / remembered / easy | 自己評価の結果（自己評価イベント） | forgot / hard / remembered / easy |  |
| `source` | TEXT |  |  | 値：ios / web / app / mcp | どの端末から来たか | ios / web / app |  |
| `count_outcome` | TEXT |  |  |  | 統計に数えるか（値は実装時に確認） |  |  |

テーブル制約：`PRIMARY KEY (user_id, event_id)`

#### `review_schedules`

知識項目ごとの復習の進み具合（間隔反復）

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `user_id` | INTEGER | 必須 |  | → `users.id`、連動して削除 | 所有ユーザー |  | 旧テーブルの `user_id` |
| `point_rid` | INTEGER | 必須 |  | → `knowledge_points.rid`、連動して削除 | 知識項目 |  | `progress.item_id` |
| `status` | TEXT | 必須 |  | 値：learning / review / mastered | 学習中 / 復習中 / 習得済み | learning 学習中 283 / review 復習中 199 / mastered 習得済み 56 | `progress_json.status` |
| `review_count` | INTEGER | 必須 | 0 |  | 復習した回数 |  | `progress_json.reviewCount` |
| `ease` | REAL | 必須 | 2.5 | 範囲 1.3–3.0 | 難易度係数。大きいほど間隔が早く伸びる | 1.3–3.0 | `progress_json.ease` |
| `interval_days` | INTEGER | 必須 | 0 |  | 現在の復習間隔（日） |  | `progress_json.intervalDays` |
| `due_at` | TEXT |  |  |  | 次の復習日時 |  | `progress_json.nextReviewAt` |
| `first_seen_at` | TEXT |  |  |  | 初めて学習した日時 |  | 同名フィールド |
| `last_reviewed_at` | TEXT |  |  |  | 最後に復習した日時 |  | 同名フィールド |
| `last_attempt_rid` | INTEGER |  |  | → `practice_attempts.rid`、削除時に NULL | 最後にこれを練習した練習記録 |  | `progress_json.lastPracticeSessionId` |
| `updated_at` | TEXT | 必須 |  |  | 最終更新日時 |  | 旧テーブルの `updated_at`。旧データにない場合は移行日時 |

テーブル制約：`PRIMARY KEY (user_id, point_rid)`

インデックス `review_schedules_due`：(user_id, due_at)

#### `review_schedule_baselines`

iOS のオフライン同期の共通の基準（3 方向マージで、サーバーの進捗が別の端末で変更されたかを判断）

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `user_id` | INTEGER | 必須 |  | → `users.id`、連動して削除 | 所有ユーザー |  | 旧テーブルの `user_id` |
| `point_rid` | INTEGER | 必須 |  | → `knowledge_points.rid`、連動して削除 |  |  |  |
| `status` | TEXT | 必須 |  | 値：learning / review / mastered |  |  |  |
| `review_count` | INTEGER | 必須 |  |  |  |  |  |
| `ease` | REAL | 必須 |  |  |  |  |  |
| `interval_days` | INTEGER | 必須 |  |  |  |  |  |
| `due_at` | TEXT |  |  |  |  |  |  |
| `first_seen_at` | TEXT |  |  |  |  |  |  |
| `last_reviewed_at` | TEXT |  |  |  |  |  |  |
| `last_attempt_rid` | INTEGER |  |  | → `practice_attempts.rid`、削除時に NULL |  |  |  |
| `updated_at` | TEXT | 必須 |  |  | 最終更新日時 |  | 旧テーブルの `updated_at`。旧データにない場合は移行日時 |

テーブル制約：`PRIMARY KEY (user_id, point_rid)`

#### `memory_ratings`

カードの自己評価の記録

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `user_id` | INTEGER | 必須 |  | → `users.id`、連動して削除 | 所有ユーザー |  | 旧テーブルの `user_id` |
| `event_id` | TEXT | 必須 |  |  | クライアントのイベント ID。重複送信を防ぐ |  | `card_reviews.event_id` |
| `point_rid` | INTEGER | 必須 |  | → `knowledge_points.rid`、連動して削除 | 知識項目 |  | `card_reviews.item_id` |
| `rating` | TEXT | 必須 |  | 値：forgot / hard / remembered / easy | 忘れた / 難しい / 覚えていた / 簡単 | forgot 忘れた / hard 難しい / remembered 覚えていた / easy 簡単 | `card_reviews.rating` |
| `reviewed_at` | TEXT | 必須 |  |  | 自己評価した日時 |  | `card_reviews.reviewed_at` |
| `source` | TEXT | 必須 |  | 値：ios / web / app / mcp | どの端末から来たか | ios 129 / app 66 / web 1 | `card_reviews.source` |

テーブル制約：`PRIMARY KEY (user_id, event_id)`

### 7. AI の下書き

#### `ai_drafts`

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 必須 |  | 主キー | 内部主キー（自動採番の整数） |  | 新規生成 |
| `user_id` | INTEGER | 必須 |  | → `users.id`、連動して削除 | 所有ユーザー |  | 旧テーブルの `user_id` |
| `code` | TEXT | 必須 |  |  | 下書きの番号：DR7 | DR7 | 新規生成 |
| `status` | TEXT | 必須 |  | 値：draft / needs_revision / approved / archived | 確認待ち / 要修正 / 確認済み / アーカイブ済み | draft 確認待ち / needs_revision 要修正 / approved 確認済み / archived アーカイブ済み | `review_pack_drafts.status` |
| `kind` | TEXT |  |  | 値：daily_review_pack / grammar_practice | 下書きの種類：デイリー復習パック / 文法練習 | daily_review_pack デイリー復習パック / grammar_practice 文法練習 | `content_json.kind` |
| `strategy` | TEXT |  |  | 値：targeted_by_history / agent_topic | 出題方法 | targeted_by_history 解答履歴に基づく | `content_json.strategy` |
| `target_level` | TEXT |  |  | 値：N5 / N4 / N3 / N2 / N1 | 目標レベル | N1 | `content_json.target_level` |
| `practice_date` | TEXT |  |  |  | 練習予定日 |  | `content_json.practice_date` |
| `minutes` | INTEGER |  |  |  | 見込み時間（分） |  | `content_json.estimated_minutes` / `minutes` を統合 |
| `generated_at` | TEXT |  |  |  | 生成日時 |  | `content_json.generated_at` |
| `created_at` | TEXT | 必須 |  |  | 作成日時 |  | 旧テーブルの `created_at`。旧データにない場合は移行日時 |
| `updated_at` | TEXT | 必須 |  |  | 最終更新日時 |  | 旧テーブルの `updated_at`。旧データにない場合は移行日時 |

テーブル制約：`UNIQUE (user_id, code)`

翻訳フィールド（`content_translations.owner_table` = `ai_drafts`）：`title` 下書きのタイトル、`description` 下書きの説明、`next_step` 次のステップの提案

#### `ai_draft_objectives`

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 必須 |  | 主キー | 内部主キー（自動採番の整数） |  | 新規生成 |
| `draft_rid` | INTEGER | 必須 |  | → `ai_drafts.rid`、連動して削除 |  |  |  |
| `position` | INTEGER | 必須 |  |  | リスト内の順序（0 始まり） |  | 旧配列内の順序 |

テーブル制約：`UNIQUE (draft_rid, position)`

翻訳フィールド（`content_translations.owner_table` = `ai_draft_objectives`）：`objective` 学習目標

#### `ai_draft_sections`

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 必須 |  | 主キー | 内部主キー（自動採番の整数） |  | 新規生成 |
| `draft_rid` | INTEGER | 必須 |  | → `ai_drafts.rid`、連動して削除 |  |  |  |
| `position` | INTEGER | 必須 |  |  | リスト内の順序（0 始まり） |  | 旧配列内の順序 |
| `instruction` | TEXT |  |  |  | セクションの指示文（日本語） |  | `content_json.sections[]`.instruction |

テーブル制約：`UNIQUE (draft_rid, position)`

翻訳フィールド（`content_translations.owner_table` = `ai_draft_sections`）：`title` 下書きのセクションのタイトル、`body` 下書きのセクションの本文

#### `ai_draft_questions`

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 必須 |  | 主キー | 内部主キー（自動採番の整数） |  | 新規生成 |
| `draft_rid` | INTEGER | 必須 |  | → `ai_drafts.rid`、連動して削除 |  |  |  |
| `section_rid` | INTEGER |  |  | → `ai_draft_sections.rid`、連動して削除 | 所属するセクション。セクションに属さない場合は空 |  |  |
| `role` | TEXT | 必須 |  | 値：section / quiz / generated | セクションの問題 / 小テスト / 生成した練習問題 |  | `sections[].questions[]` → section、`quiz[]` → quiz、`generated_practice[]` → generated |
| `position` | INTEGER | 必須 |  |  | リスト内の順序（0 始まり） |  | 旧配列内の順序 |
| `question_rid` | INTEGER | 必須 |  | → `questions.rid`、参照中は削除不可 | 問題（下書きを削除しても問題は残す） |  | 下書き内の問題を問題バンクに移行した問題 |

テーブル制約：`UNIQUE (draft_rid, role, section_rid, position)`

#### `ai_draft_comments`

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 必須 |  | 主キー | 内部主キー（自動採番の整数） |  | 新規生成 |
| `draft_rid` | INTEGER | 必須 |  | → `ai_drafts.rid`、連動して削除 |  |  |  |
| `code` | TEXT | 必須 |  |  | コメントの番号：DC3（ユーザーごとに採番） |  | 新規生成 |
| `body` | TEXT | 必須 |  |  | コメントの内容（ユーザーまたは AI が書いた原文で、翻訳しない） |  | `review_pack_drafts.annotations_json[]`.body |
| `created_at` | TEXT | 必須 |  |  | 作成日時 |  | 旧テーブルの `created_at`。旧データにない場合は移行日時 |
| `updated_at` | TEXT | 必須 |  |  | 最終更新日時 |  | 旧テーブルの `updated_at`。旧データにない場合は移行日時 |

### 8. 学習計画

#### `learning_plans`

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `user_id` | INTEGER | 必須 |  | 主キー；→ `users.id`、連動して削除 | 1 ユーザー 1 件 |  | 旧テーブルの `user_id` |
| `exam_name` | TEXT |  |  |  | 目標の試験：JLPT 2026年12月 | JLPT 2026年12月 | `plan_json.profile.examName` |
| `level` | TEXT |  |  | 値：N5 / N4 / N3 / N2 / N1 | 目標レベル | N1 | `profile.level` |
| `start_date` | TEXT |  |  |  | 計画の開始日 |  | `profile.startDate`、`examDate` |
| `exam_date` | TEXT |  |  |  | 試験日 |  | `profile.startDate`、`examDate` |
| `study_days_per_week` | INTEGER |  |  | 範囲 1–7 | 週あたりの学習日数 |  | `profile.studyDaysPerWeek` |
| `daily_minutes` | INTEGER |  |  |  | 1 日あたりの学習時間（分） |  | `profile.dailyMinutes` |
| `material_start_status` | TEXT |  |  |  | 教材をどこから始めるか（値は実装時に確認） |  | `profile.materialStartStatus` |
| `status` | TEXT | 必須 |  | 値：profile_only / ready / needs_refresh | 基本情報のみ / 生成済み / 再生成が必要 | profile_only 基本情報のみ / ready 生成済み / needs_refresh 再生成が必要 | `plan_json.status` |
| `generated_at` | TEXT |  |  |  | 計画を生成した日時 |  | `plan_json.generatedAt` |
| `created_at` | TEXT | 必須 |  |  | 作成日時 |  | 旧テーブルの `created_at`。旧データにない場合は移行日時 |
| `updated_at` | TEXT | 必須 |  |  | 最終更新日時 |  | 旧テーブルの `updated_at`。旧データにない場合は移行日時 |

翻訳フィールド（`content_translations.owner_table` = `learning_plans`）：`fixed_schedule` 固定の日程の説明、`supplemental_needs` 追加の要望、`phase_strategy` 段階ごとの方針、`post_material_strategy` 教材を終えた後の方針、`goal` 学習目標

#### `learning_plan_materials`

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 必須 |  | 主キー | 内部主キー（自動採番の整数） |  | 新規生成 |
| `user_id` | INTEGER | 必須 |  | → `learning_plans.user_id`、連動して削除 | 所有ユーザー |  | 旧テーブルの `user_id` |
| `position` | INTEGER | 必須 |  |  | リスト内の順序（0 始まり） |  | 旧配列内の順序 |
| `module` | TEXT |  |  | 値：vocabulary / grammar / reading / listening / other | 教材の所属モジュール |  | `plan_json.profile.materials[]`.module |

テーブル制約：`UNIQUE (user_id, position)`

翻訳フィールド（`content_translations.owner_table` = `learning_plan_materials`）：`title` 教材名、`current_position` 教材の現在の進み具合

#### `learning_plan_tasks`

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 必須 |  | 主キー | 内部主キー（自動採番の整数） |  | 新規生成 |
| `user_id` | INTEGER | 必須 |  | → `learning_plans.user_id`、連動して削除 | 所有ユーザー |  | 旧テーブルの `user_id` |
| `code` | TEXT | 必須 |  |  | タスクの番号：TK12 |  | 新規生成 |
| `scheduled_date` | TEXT | 必須 |  |  | 日付 |  | `plan_json.tasks[]`.date |
| `module` | TEXT | 必須 |  | 値：vocabulary / grammar / reading / listening / other |  |  | `plan_json.tasks[]`.module |
| `minutes` | INTEGER |  |  |  | 所要時間（分） |  | `plan_json.tasks[]`.minutes |
| `material_rid` | INTEGER |  |  | → `learning_plan_materials.rid`、削除時に NULL | 対応する教材 |  | `plan_json.tasks[]`.materialId |
| `workload_kind` | TEXT |  |  |  | 作業量の種類（旧データはすべて空。残すかどうかは実装時に決める） |  | `plan_json.tasks[]`.workloadKind |
| `status` | TEXT | 必須 |  | 値：pending / completed / skipped / missed | 未着手 / 完了 / スキップ / 未実施 |  | `plan_json.tasks[]`.status |
| `completed_at` | TEXT |  |  |  |  |  | `plan_json.tasks[]`.completedAt |
| `created_at` | TEXT | 必須 |  |  | 作成日時 |  | 旧テーブルの `created_at`。旧データにない場合は移行日時 |
| `updated_at` | TEXT | 必須 |  |  | 最終更新日時 |  | 旧テーブルの `updated_at`。旧データにない場合は移行日時 |

テーブル制約：`UNIQUE (user_id, code)`

翻訳フィールド（`content_translations.owner_table` = `learning_plan_tasks`）：`title` タスクのタイトル、`detail` タスクの説明、`source_label` タスクの出典

#### `learning_plan_phases`

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 必須 |  | 主キー | 内部主キー（自動採番の整数） |  | 新規生成 |
| `user_id` | INTEGER | 必須 |  | → `learning_plans.user_id`、連動して削除 | 所有ユーザー |  | 旧テーブルの `user_id` |
| `position` | INTEGER | 必須 |  |  | リスト内の順序（0 始まり） |  | 旧配列内の順序 |
| `start_date` | TEXT | 必須 |  |  |  |  | `plan_json.phases[]`.startDate |
| `end_date` | TEXT | 必須 |  |  |  |  | `plan_json.phases[]`.endDate |

テーブル制約：`UNIQUE (user_id, position)`

翻訳フィールド（`content_translations.owner_table` = `learning_plan_phases`）：`focus` 段階の重点、`goal` 段階の目標

#### `learning_plan_phase_points`

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 必須 |  | 主キー | 内部主キー（自動採番の整数） |  | 新規生成 |
| `phase_rid` | INTEGER | 必須 |  | → `learning_plan_phases.rid`、連動して削除 |  |  |  |
| `position` | INTEGER | 必須 |  |  | リスト内の順序（0 始まり） |  | 旧配列内の順序 |

テーブル制約：`UNIQUE (phase_rid, position)`

翻訳フィールド（`content_translations.owner_table` = `learning_plan_phase_points`）：`point` 段階の要点

### 9. 日々のまとめ

#### `daily_reports`

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 必須 |  | 主キー | 内部主キー（自動採番の整数） |  | 新規生成 |
| `user_id` | INTEGER | 必須 |  | → `users.id`、連動して削除 | 所有ユーザー |  | 旧テーブルの `user_id` |
| `summary_date` | TEXT | 必須 |  |  | まとめる日付 |  | `daily_summaries.date` |
| `time_zone` | TEXT | 必須 |  |  | その日をどのタイムゾーンで区切るか |  | `time_zone` |
| `total_questions` | INTEGER | 必須 |  |  | その日に解答した問題数 |  | 同名の列 |
| `correct_count` | INTEGER | 必須 |  |  | 正解数 |  | 同名の列 |
| `incorrect_count` | INTEGER | 必須 |  |  | 不正解数 |  | 同名の列 |
| `accuracy` | REAL |  |  |  | 正答率 |  | 同名の列 |
| `unique_items` | INTEGER |  |  |  | その日に関係した知識項目の数 |  | `stats_json.uniqueItems` |
| `generated_at` | TEXT |  |  |  | 生成日時 |  | `generated_at` |
| `created_at` | TEXT | 必須 |  |  | 作成日時 |  | 旧テーブルの `created_at`。旧データにない場合は移行日時 |
| `updated_at` | TEXT | 必須 |  |  | 最終更新日時 |  | 旧テーブルの `updated_at`。旧データにない場合は移行日時 |

テーブル制約：`UNIQUE (user_id, summary_date)`

翻訳フィールド（`content_translations.owner_table` = `daily_reports`）：`summary` 日々のまとめの本文

#### `daily_report_type_stats`

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `report_rid` | INTEGER | 必須 |  | → `daily_reports.rid`、連動して削除 |  |  |  |
| `type_id` | TEXT | 必須 |  | → `question_types.type_id`、参照中は削除不可 | 問題形式 |  | `stats_json.byKind[]`.kind を公式問題形式に換算 |
| `total` | INTEGER | 必須 |  |  |  |  | `stats_json.byKind[]`.total |
| `correct` | INTEGER | 必須 |  |  |  |  | `stats_json.byKind[]`.correct |
| `incorrect` | INTEGER | 必須 |  |  |  |  | `stats_json.byKind[]`.incorrect |
| `accuracy` | REAL |  |  |  |  |  | `stats_json.byKind[]`.accuracy |

テーブル制約：`PRIMARY KEY (report_rid, type_id)`

#### `daily_report_points`

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 必須 |  | 主キー | 内部主キー（自動採番の整数） |  | 新規生成 |
| `report_rid` | INTEGER | 必須 |  | → `daily_reports.rid`、連動して削除 |  |  |  |
| `kind` | TEXT | 必須 |  | 値：strength / weakness | 強み / 弱み |  | `strengths_json[]` → strength、`weaknesses_json[]` → weakness |
| `position` | INTEGER | 必須 |  |  | リスト内の順序（0 始まり） |  | 旧配列内の順序 |

テーブル制約：`UNIQUE (report_rid, kind, position)`

翻訳フィールド（`content_translations.owner_table` = `daily_report_points`）：`label` 強み / 弱みの名前、`detail` 強み / 弱みの説明

#### `daily_report_confusions`

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 必須 |  | 主キー | 内部主キー（自動採番の整数） |  | 新規生成 |
| `report_rid` | INTEGER | 必須 |  | → `daily_reports.rid`、連動して削除 |  |  |  |
| `position` | INTEGER | 必須 |  |  | リスト内の順序（0 始まり） |  | 旧配列内の順序 |

テーブル制約：`UNIQUE (report_rid, position)`

翻訳フィールド（`content_translations.owner_table` = `daily_report_confusions`）：`topic` 紛らわしいテーマ

#### `daily_report_confusion_points`

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `confusion_rid` | INTEGER | 必須 |  | → `daily_report_confusions.rid`、連動して削除 |  |  |  |
| `point_rid` | INTEGER | 必須 |  | → `knowledge_points.rid`、連動して削除 | 関係する知識項目 |  | `confusion_groups_json[]`.items[] |

テーブル制約：`PRIMARY KEY (confusion_rid, point_rid)`

#### `daily_report_confusion_questions`

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `confusion_rid` | INTEGER | 必須 |  | → `daily_report_confusions.rid`、連動して削除 |  |  |  |
| `question_rid` | INTEGER | 必須 |  | → `questions.rid`、連動して削除 | 根拠となる問題 |  | `confusion_groups_json[]`.evidenceQuestionIds[] |

テーブル制約：`PRIMARY KEY (confusion_rid, question_rid)`

#### `daily_report_recommendations`

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 必須 |  | 主キー | 内部主キー（自動採番の整数） |  | 新規生成 |
| `report_rid` | INTEGER | 必須 |  | → `daily_reports.rid`、連動して削除 |  |  |  |
| `position` | INTEGER | 必須 |  |  | リスト内の順序（0 始まり） |  | 旧配列内の順序 |
| `type` | TEXT | 必須 |  | 値：review / practice / quality / priority / card_review | 復習 / 練習 / 内容の品質 / 優先度 / カード復習 |  | `recommendations_json[]`.type |

テーブル制約：`UNIQUE (report_rid, position)`

翻訳フィールド（`content_translations.owner_table` = `daily_report_recommendations`）：`title` 提案のタイトル、`detail` 提案の内容

#### `daily_report_wrong_answers`

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 必須 |  | 主キー | 内部主キー（自動採番の整数） |  | 新規生成 |
| `report_rid` | INTEGER | 必須 |  | → `daily_reports.rid`、連動して削除 |  |  |  |
| `position` | INTEGER | 必須 |  |  | リスト内の順序（0 始まり） |  | 旧配列内の順序 |
| `question_rid` | INTEGER |  |  | → `questions.rid`、削除時に NULL | 間違えた問題 |  | `wrong_questions_json[]`.questionId |
| `point_rid` | INTEGER |  |  | → `knowledge_points.rid`、削除時に NULL | 関連する知識項目 |  | `wrong_questions_json[]`.itemId |
| `selected` | TEXT |  |  |  | 選んだ答え |  | `wrong_questions_json[]`.selected |
| `correct_answer` | TEXT |  |  |  | 正解 |  | `wrong_questions_json[]`.correctAnswer |

テーブル制約：`UNIQUE (report_rid, position)`

### 10. 受信箱とシャドーイング録音

#### `inbox_captures`

受信箱：学習中にメモした、整理待ちの内容

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 必須 |  | 主キー | 内部主キー（自動採番の整数） |  | 新規生成 |
| `user_id` | INTEGER | 必須 |  | → `users.id`、連動して削除 | 所有ユーザー |  | 旧テーブルの `user_id` |
| `code` | TEXT | 必須 |  |  | 番号：IN12 | IN12 | 新規生成 |
| `body` | TEXT | 必須 |  |  | メモした内容：開校 | 開校 | `learning_captures.body` |
| `category` | TEXT | 必須 |  | 値：word / grammar / sentence / listening / reading / unsure | 内容の種類 | word 単語 286 / grammar 文法 28 / sentence / listening / reading / unsure | `category` |
| `context` | TEXT |  |  |  | 出典や前後の文脈 | 点词查询\n原文：…（単語検索と原文） | `context` |
| `target_wordbook_rid` | INTEGER |  |  | → `wordbooks.rid`、削除時に NULL | 整理後にどの単語帳に入れるか |  | `target_wordbook_id`（旧 `target_deck` は移行した単語帳に換算） |
| `status` | TEXT | 必須 |  | 値：inbox / processed / archived | 未処理 / 整理済み / アーカイブ済み | inbox 未処理 185 / processed 整理済み 128 / archived アーカイブ済み 1 | `status` |
| `created_at` | TEXT | 必須 |  |  | 作成日時 |  | 旧テーブルの `created_at`。旧データにない場合は移行日時 |
| `updated_at` | TEXT | 必須 |  |  | 最終更新日時 |  | 旧テーブルの `updated_at`。旧データにない場合は移行日時 |

テーブル制約：`UNIQUE (user_id, code)`

#### `speaking_recordings`

シャドーイング録音

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 必須 |  | 主キー | 内部主キー（自動採番の整数） |  | 新規生成 |
| `user_id` | INTEGER | 必須 |  | → `users.id`、連動して削除 | 所有ユーザー |  | 旧テーブルの `user_id` |
| `code` | TEXT | 必須 |  |  | 番号：RC1 | RC1 | 新規生成 |
| `question_rid` | INTEGER |  |  | → `questions.rid`、削除時に NULL | シャドーイングした聴解問題 |  | `listening_question_id` |
| `audio_media_rid` | INTEGER | 必須 |  | → `media_files.rid`、参照中は削除不可 | 録音ファイル |  | `audio_mime`、`audio_size`、`audio_path` は `media_files` に移す |
| `status` | TEXT | 必須 |  | 値：pending / analyzing / completed / failed | 分析待ち / 分析中 / 完了 / 失敗 | pending 分析待ち / analyzing 分析中 / completed 完了 / failed 失敗 | `status` |
| `transcript` | TEXT |  |  |  | 認識された日本語 |  | `analysis_json.transcript` |
| `reference_transcript` | TEXT |  |  |  | 参照する原文 |  | `analysis_json.referenceTranscript` |
| `created_at` | TEXT | 必須 |  |  | 作成日時 |  | 旧テーブルの `created_at`。旧データにない場合は移行日時 |
| `updated_at` | TEXT | 必須 |  |  | 最終更新日時 |  | 旧テーブルの `updated_at`。旧データにない場合は移行日時 |

テーブル制約：`UNIQUE (user_id, code)`

翻訳フィールド（`content_translations.owner_table` = `speaking_recordings`）：`summary` 録音分析のまとめ、`next_practice` 次の練習の提案

#### `speaking_recording_notes`

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `rid` | INTEGER | 必須 |  | 主キー | 内部主キー（自動採番の整数） |  | 新規生成 |
| `recording_rid` | INTEGER | 必須 |  | → `speaking_recordings.rid`、連動して削除 |  |  |  |
| `kind` | TEXT | 必須 |  | 値：strength / improvement | よかった点 / 改善点 |  | `analysis_json.strengths[]` → strength、`improvements[]` → improvement |
| `position` | INTEGER | 必須 |  |  | リスト内の順序（0 始まり） |  | 旧配列内の順序 |

テーブル制約：`UNIQUE (recording_rid, kind, position)`

翻訳フィールド（`content_translations.owner_table` = `speaking_recording_notes`）：`note` 録音へのフィードバック

### 10b. 市場（共有と取り込み）

#### `market_shares`

共有

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `id` | TEXT | 必須 |  | 主キー | 共有番号（UUID。公開リンクに使う） |  |  |
| `user_id` | INTEGER | 必須 |  | → `users.id`、連動して削除 | 所有ユーザー |  | 旧テーブルの `user_id` |
| `source_id` | TEXT | 必須 |  |  | 共有元：単語帳の番号（WB1）または練習の番号（DP3） |  |  |
| `kind` | TEXT | 必須 |  | 値：wordbook / practice | 単語帳の共有 / 練習の共有 |  |  |
| `package_json` | TEXT | 必須 |  |  | 現在の版の共有パッケージ（v2 形式）と共有者のファイル番号 |  |  |
| `created_at` | TEXT | 必須 |  |  | 作成日時 |  | 旧テーブルの `created_at`。旧データにない場合は移行日時 |
| `withdrawn` | INTEGER | 必須 | 0 | 値：0 / 1 | 取り下げたか（取り下げた共有は取り込めない） |  |  |

#### `market_share_versions`

共有の各版

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `share_id` | TEXT | 必須 |  | → `market_shares.id`、連動して削除 |  |  |  |
| `revision` | INTEGER | 必須 |  |  | 版番号（1 から） |  |  |
| `package_json` | TEXT | 必須 |  |  | この版の共有パッケージ |  |  |
| `fingerprint` | TEXT | 必須 |  |  | 共有パッケージの内容のハッシュ。重複した取り込みの判定に使う |  |  |
| `created_at` | TEXT | 必須 |  |  | 作成日時 |  | 旧テーブルの `created_at`。旧データにない場合は移行日時 |

テーブル制約：`PRIMARY KEY (share_id, revision)`

#### `market_imports`

取り込みの記録（同じ版は一度だけ取り込む）

| 列 | 型 | 必須 | 既定値 | 制約 / 参照 | 意味 | 値 / 例 | 旧データの出所 |
|---|---|---|---|---|---|---|---|
| `user_id` | INTEGER | 必須 |  | → `users.id`、連動して削除 | 所有ユーザー |  | 旧テーブルの `user_id` |
| `digest` | TEXT | 必須 |  |  | 共有番号 + 内容のハッシュ |  |  |
| `result_json` | TEXT | 必須 |  |  | 取り込みの結果：作った単語帳・知識項目・題組・練習の番号と、飛ばした問題 |  |  |

テーブル制約：`PRIMARY KEY (user_id, digest)`

### 11. 翻訳可能フィールドの登録（上の各テーブルのコメントにある「翻訳フィールド」と 1 対 1 に対応）

### 12. 業務行を削除したときに翻訳とふりがなを削除する（翻訳は「テーブル名＋rid」で紐付けており、外部キーで連動削除できない）

<!-- schema-doc:end -->
