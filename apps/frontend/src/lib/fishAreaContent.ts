export type MethodCard = {
  icon: string
  name: string
  summary: string
  details: { label: string; value: string }[]
  tip: string
}

export type SeasonBox = {
  period: string
  label: string
  color: string   // アクセントカラー
  description: string
}

export type FishAreaContent = {
  heading: string
  intro: string
  methods: MethodCard[]
  seasons: SeasonBox[]
  spots: string[]
}

// key: `${fishSlug}/${areaSlug}`
export const fishAreaContents: Record<string, FishAreaContent> = {
  'tachiuo/tokyo': {
    heading: '東京湾タチウオ釣り入門',
    intro:
      '東京湾の船タチウオ釣りは「ルアー」「天秤」「テンヤ」の3スタイルで楽しめる人気ターゲット。' +
      '夏は水深10〜20mの浅場（"夏タチ"）、秋冬は80〜100m以上の深場へ移行する。' +
      '指3〜5本サイズが良型の目安で、数釣りも型狙いも楽しめるのが東京湾タチウオの魅力。',
    methods: [
      {
        icon: '🎣',
        name: 'ルアー（ジギング）',
        summary: '手返しよく広く探れるスタイル。エサ付け不要で扱いやすく入門にも最適。',
        details: [
          { label: 'ジグ重さ',   value: '80g・100g・120gが中心。浅場は60g、深場は150gも' },
          { label: 'タックル',   value: '6ft前後のベイトロッド・小型ベイトリール（ハイギア）・PE0.8〜1号' },
          { label: 'カラー',     value: 'シルバー系を軸に、グロー・ゼブラを状況に応じてローテーション' },
        ],
        tip: 'フォール中のバイトを見逃さないよう、ラインの動きを常にチェック。',
      },
      {
        icon: '🦈',
        name: '天秤（エサ釣り）',
        summary: 'サバ切り身を使うエサ釣り。正確なタナ取りとシャクリが釣果を大きく左右する。',
        details: [
          { label: 'オモリ',     value: '40〜80号（深場は100号対応も視野に入れる）' },
          { label: 'タックル',   value: '2m前後のタチウオ竿・小型電動リール（深場で特に有効）' },
          { label: 'エサ',       value: 'サバの切り身。まっすぐ付けてひらひらアクションさせるのがコツ' },
        ],
        tip: 'アタリ後は即アワセせず、食い込みを確認してからゆっくり巻き上げる。',
      },
      {
        icon: '⚓',
        name: 'テンヤ',
        summary: 'イワシを巻き付けて狙う最もゲーム性が高いスタイル。ロッドワークが重要。',
        details: [
          { label: 'テンヤ重さ', value: '40号・50号を中心に複数用意。流れの強さで使い分け' },
          { label: 'タックル',   value: 'テンヤ専用竿・PE1号前後・小型電動リール' },
          { label: 'カラー',     value: 'ゼブラ・イワシカラー・赤金・シルバー・ゴールドのローテーション' },
        ],
        tip: 'タナを細かく探り、アタリがあったら大きくアワセを入れる。',
      },
    ],
    seasons: [
      {
        period: '7〜8月',
        label: '夏タチ',
        color: '#f59e0b',
        description: '水深10〜20mの浅場。ライトタックルで手軽に楽しめるシーズン。',
      },
      {
        period: '9〜11月',
        label: '秋・最盛期',
        color: '#10b981',
        description: '徐々に深場へ移行。好釣果が続くベストシーズン。型も数も狙える。',
      },
      {
        period: '12〜2月',
        label: '冬・深場',
        color: '#3b82f6',
        description: '水深80〜100m以上の深場。電動リールが活躍。大型が多く出るシーズン。',
      },
      {
        period: '3〜6月',
        label: 'シーズンオフ',
        color: '#64748b',
        description: 'タチウオは少なくなる時期。他の魚種を楽しむか、シーズン開幕を待つ。',
      },
    ],
    spots: ['走水沖', '本牧沖', '観音崎周辺', '久里浜沖', '猿島周辺', '富津沖'],
  },
}
