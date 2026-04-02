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
}
