# みんなの声（民意を集める投票サイト）

年代・性別・年収・年金の受給状況ごとに、投票結果をリアルタイムで見える化するサイトです。
Cloudflare Workers（画面と API）と Cloudflare D1（データベース）だけで動きます。

## 票のルール

- 投票テーマが始まるたびに、全アカウントに **1 票** が配られる
- 投票しなかった票は **次に持ち越せる**（上限は `wrangler.jsonc` の `MAX_BALANCE`、初期値 3 票）
- 投票するときは、手持ちの票から何票使うか選ぶ
  - `+n` … 選択肢に賛成 n 票
  - `-n` … 選択肢に反対 n 票（マイナス票）
- 1 テーマにつき 1 回だけ。あとから変更はできない

## 集める情報

生まれた年（年代で集計）・性別・年収帯・年金の受給有無のみ。ログインには ID とパスワードを使い、
氏名やメールアドレスは聞きません。投票時の属性は票と一緒に記録するので、あとでプロフィールを変えても過去の集計は変わりません。

## 画面

| URL | 内容 |
|---|---|
| `/#/` | テーマ一覧 |
| `/#/register` `/#/login` | アカウント作成・ログイン |
| `/#/poll/<番号>` | 投票と結果（5 秒ごとに自動更新） |
| `/#/me` | 持ち票・投票履歴・プロフィール・退会 |
| `/#/admin` | テーマ作成、CSV 書き出し（管理者トークンが必要） |

## 公開手順

```sh
cd vote-site
npx wrangler login
npx wrangler d1 create minnano-koe          # 表示された database_id を wrangler.jsonc に書く
npx wrangler d1 execute minnano-koe --remote --file=schema.sql
npx wrangler secret put ADMIN_TOKEN          # 管理画面用の長いランダム文字列
npx wrangler deploy
```

## 手元で動かす

```sh
cd vote-site
echo 'ADMIN_TOKEN=test-admin' > .dev.vars
npx wrangler d1 execute minnano-koe --local --file=schema.sql
npx wrangler dev
```

## Google に保存したい場合

管理画面から投票データを CSV（個人を特定する情報なし）で書き出し、Google スプレッドシートに読み込めます。
自動で送りたい場合は、Worker の投票処理から Google Sheets API / BigQuery に追記する処理を足します。

## 注意（本番前に検討すること）

- **1 人 1 アカウントは保証できない**：ID とパスワードだけなので、複数アカウントで票を増やせてしまう。
  本気で「1 人 1 票」にするには、マイナンバーカードの公的個人認証や SMS 認証などの本人確認が必要。
- ログイン試行の回数制限がない（Cloudflare の Rate Limiting ルールで追加できる）。
- パスワードを忘れると復旧できない（メールアドレスを聞かない設計のため）。
- 結果の自動更新は 5 秒ごとの再読み込み。利用者が増えたら結果を数秒キャッシュするとよい。
