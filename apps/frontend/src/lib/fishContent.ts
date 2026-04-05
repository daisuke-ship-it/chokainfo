/*
 * ── DBマイグレーション（Supabaseで手動実行） ──────────────────────────
 * ALTER TABLE fish_species ADD COLUMN IF NOT EXISTS slug text UNIQUE;
 * UPDATE fish_species SET slug = 'tachiuo' WHERE name = 'タチウオ';
 * UPDATE fish_species SET slug = 'aji'     WHERE name = 'アジ';
 * UPDATE fish_species SET slug = 'seabass' WHERE name = 'シーバス';
 * UPDATE fish_species SET slug = 'sawara'  WHERE name = 'サワラ';
 */

export type FishContent = {
  name: string
  slug: string
  season: string
  description: string
  points: string
  methods: string
  metaTitle: string
  metaDescription: string
}

/** 動的にタイトルに年月を含める（SEO用） */
export function fishMetaTitle(content: FishContent): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  return `${content.name}の釣果情報【${y}年${m}月最新】| 釣果情報.com`
}

export function fishMetaDescription(content: FishContent): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  return `${y}年${m}月の${content.name}最新釣果。東京湾・相模湾・外房・南房の船宿釣果を毎日自動更新。AIサマリー付き。`
}

export const fishContents: Record<string, FishContent> = {
  tachiuo: {
    name: 'タチウオ',
    slug: 'tachiuo',
    season: '通年（夏〜秋が最盛期）',
    description: '東京湾のタチウオは走水沖・観音崎・富津沖が主なポイント。テンヤ・ルアー・エサ釣りで楽しめる人気の対象魚。銀白色の体が特徴的で、指3〜5本サイズが良型の目安。',
    points: '走水沖・観音崎沖・富津沖・横須賀沖',
    methods: 'テンヤ・ルアー（ジギング）・エサ釣り',
    metaTitle: '東京湾タチウオ釣果情報 | 最新釣果まとめ - 釣果情報.com',
    metaDescription: '東京湾のタチウオ最新釣果。忠彦丸・深川吉野屋など各船宿の釣果を毎日自動更新。AIによる釣況サマリー付き。',
  },
  aji: {
    name: 'アジ',
    slug: 'aji',
    season: '通年（春〜夏が最盛期）',
    description: '東京湾のアジ釣りはコマセ仕掛けが主流。数釣りが楽しめる人気魚種で、釣れたアジをそのまま刺身・アジフライにするのが醍醐味。20〜35cmの良型が狙える。',
    points: '中ノ瀬・第二海堡周辺・横浜沖',
    methods: 'コマセ・サビキ・アジビシ',
    metaTitle: '東京湾アジ釣果情報 | 最新釣果まとめ - 釣果情報.com',
    metaDescription: '東京湾のアジ最新釣果。各船宿の釣果を毎日自動更新。数釣りシーズン情報もAIサマリーで確認。',
  },
  seabass: {
    name: 'シーバス',
    slug: 'seabass',
    season: '通年（秋が最盛期）',
    description: '東京湾のシーバス（スズキ）はルアー船が主流。80cmオーバーのランカーも狙える人気のターゲット。夜釣りも盛んで、季節によって釣り場が大きく変わる。',
    points: '盤洲・小櫃川河口・富津岬周辺',
    methods: 'ルアー（シンキングペンシル・バイブレーション）',
    metaTitle: '東京湾シーバス釣果情報 | 最新釣果まとめ - 釣果情報.com',
    metaDescription: '東京湾のシーバス最新釣果。各船宿の釣果を毎日自動更新。AIによる釣況サマリー付き。',
  },
  sawara: {
    name: 'サワラ',
    slug: 'sawara',
    season: '秋〜冬（10〜12月が最盛期）',
    description: '東京湾のサワラはジギング・キャスティングで狙う人気魚種。80cm超の大型が狙え、刺身・西京焼きが絶品。群れに当たれば数釣りも楽しめる。',
    points: '横浜沖・横須賀沖・走水沖',
    methods: 'ジギング・キャスティング・タコベイト',
    metaTitle: '東京湾サワラ釣果情報 | 最新釣果まとめ - 釣果情報.com',
    metaDescription: '東京湾のサワラ最新釣果。各船宿の釣果を毎日自動更新。AIによる釣況サマリー付き。',
  },
  torafugu: {
    name: 'トラフグ',
    slug: 'torafugu',
    season: '冬〜春（12〜3月が最盛期）',
    description: '東京湾のトラフグはカットウ釣りが主流。2〜3kgの良型が狙え、てっさ・てっちりは最高の贅沢。湾奥から浦賀水道まで広範囲がポイント。',
    points: '浦賀水道・横須賀沖・竹岡沖・大貫沖',
    methods: 'カットウ（餌・ルアー）',
    metaTitle: '東京湾トラフグ釣果情報 | 最新釣果まとめ - 釣果情報.com',
    metaDescription: '東京湾のトラフグ最新釣果。各船宿の釣果を毎日自動更新。カットウ釣りの釣況をAIサマリーで確認。',
  },
  madai: {
    name: 'マダイ',
    slug: 'madai',
    season: '通年（春の乗っ込みが最盛期）',
    description: '東京湾のマダイはタイラバ・コマセ・一つテンヤで狙える。春の乗っ込みシーズンは大型が浅場に寄り、3〜5kgクラスも期待できる。',
    points: '剣崎沖・久里浜沖・走水沖・第二海堡',
    methods: 'タイラバ・コマセ・一つテンヤ',
    metaTitle: '東京湾マダイ釣果情報 | 最新釣果まとめ - 釣果情報.com',
    metaDescription: '東京湾のマダイ最新釣果。タイラバ・コマセの釣果を毎日自動更新。AIサマリー付き。',
  },
  hirame: {
    name: 'ヒラメ',
    slug: 'hirame',
    season: '秋〜冬（10〜2月が最盛期）',
    description: '東京湾・外房のヒラメは活きイワシの泳がせ釣りが王道。1〜3kgが平均サイズで、4kg超の大判も上がる。底を丁寧に探る繊細な釣り。',
    points: '大原沖・勝浦沖・金谷沖・竹岡沖',
    methods: '活きイワシ泳がせ・バケ釣り',
    metaTitle: 'ヒラメ釣果情報 | 最新釣果まとめ - 釣果情報.com',
    metaDescription: '東京湾・外房のヒラメ最新釣果。各船宿の釣果を毎日自動更新。AIサマリー付き。',
  },
  shirogisu: {
    name: 'シロギス',
    slug: 'shirogisu',
    season: '春〜秋（6〜9月が最盛期）',
    description: '東京湾のシロギスは船釣り入門に最適な対象魚。天ぷらが絶品で、数釣りの楽しさと繊細なアタリが魅力。束釣り（100匹超）も夢ではない。',
    points: '中ノ瀬・木更津沖・盤洲・富津沖',
    methods: '天秤仕掛け・胴突き',
    metaTitle: '東京湾シロギス釣果情報 | 最新釣果まとめ - 釣果情報.com',
    metaDescription: '東京湾のシロギス最新釣果。各船宿の釣果を毎日自動更新。数釣り情報をAIサマリーで確認。',
  },
  ika: {
    name: 'イカ',
    slug: 'ika',
    season: '通年（スルメイカ夏、ヤリイカ冬〜春）',
    description: 'スルメイカ・ヤリイカ・マルイカ・スミイカなど種類豊富。プラヅノ・スッテ仕掛けで直結やブランコで狙う。鮮度抜群の船上イカは格別の味わい。',
    points: '洲崎沖・勝山沖・城ヶ島沖・南房総沖',
    methods: 'プラヅノ直結・ブランコ・スッテ',
    metaTitle: 'イカ釣果情報 | 最新釣果まとめ - 釣果情報.com',
    metaDescription: 'スルメイカ・ヤリイカ・マルイカの最新釣果。各船宿の釣果を毎日自動更新。AIサマリー付き。',
  },
  kurodai: {
    name: 'クロダイ',
    slug: 'kurodai',
    season: '通年（春〜初夏が最盛期）',
    description: '東京湾のクロダイ（チヌ）は落とし込み・ヘチ釣り・フカセで狙える。40〜50cmの良型が狙え、引きの強さと駆け引きが魅力。湾奥の堤防周りも好ポイント。',
    points: '木更津沖・盤洲・袖ケ浦・横浜沖',
    methods: '落とし込み・ヘチ・フカセ・ダンゴ',
    metaTitle: 'クロダイ釣果情報 | 最新釣果まとめ - 釣果情報.com',
    metaDescription: '東京湾のクロダイ最新釣果。各船宿の釣果を毎日自動更新。AIサマリー付き。',
  },
  mebaru: {
    name: 'メバル',
    slug: 'mebaru',
    season: '冬〜春（12〜4月が最盛期）',
    description: '東京湾・相模湾のメバルは船釣りの冬の定番。サビキ・胴突きで20〜30cmを数釣り。煮付け・唐揚げが絶品で、初心者にも人気の対象魚。',
    points: '横須賀沖・観音崎沖・金沢八景沖・竹岡沖',
    methods: 'サビキ・胴突き',
    metaTitle: 'メバル釣果情報 | 最新釣果まとめ - 釣果情報.com',
    metaDescription: '東京湾のメバル最新釣果。各船宿の釣果を毎日自動更新。AIサマリー付き。',
  },
  amadai: {
    name: 'アマダイ',
    slug: 'amadai',
    season: '秋〜冬（10〜2月が最盛期）',
    description: '相模湾・外房のアマダイは高級魚として人気。30〜50cmが平均サイズで、松笠揚げ・昆布締めが絶品。底を丁寧に探る繊細な釣りが求められる。',
    points: '平塚沖・茅ヶ崎沖・小田原沖・勝山沖',
    methods: 'テンビン・片テンビン',
    metaTitle: 'アマダイ釣果情報 | 最新釣果まとめ - 釣果情報.com',
    metaDescription: '相模湾・外房のアマダイ最新釣果。各船宿の釣果を毎日自動更新。AIサマリー付き。',
  },
  magochi: {
    name: 'マゴチ',
    slug: 'magochi',
    season: '春〜夏（5〜8月が最盛期）',
    description: '東京湾のマゴチは活きハゼやサイマキの泳がせで狙う夏の風物詩。40〜60cmが平均サイズで、薄造り・洗いが絶品。照りゴチと呼ばれる真夏が旬。',
    points: '木更津沖・盤洲・中ノ瀬・富津沖',
    methods: '活きエサ泳がせ・ルアー',
    metaTitle: 'マゴチ釣果情報 | 最新釣果まとめ - 釣果情報.com',
    metaDescription: '東京湾のマゴチ最新釣果。各船宿の釣果を毎日自動更新。AIサマリー付き。',
  },
  kawahagi: {
    name: 'カワハギ',
    slug: 'kawahagi',
    season: '秋〜冬（10〜1月が最盛期）',
    description: '東京湾・相模湾のカワハギは繊細なアタリを掛ける技術的な釣り。肝パン（肝が大きい個体）は刺身と合わせて最高の味わい。腕の差が出る玄人好みの魚。',
    points: '竹岡沖・剣崎沖・城ヶ島沖・佐島沖',
    methods: 'カワハギ専用仕掛け（胴突き）',
    metaTitle: 'カワハギ釣果情報 | 最新釣果まとめ - 釣果情報.com',
    metaDescription: '東京湾・相模湾のカワハギ最新釣果。各船宿の釣果を毎日自動更新。AIサマリー付き。',
  },
}
