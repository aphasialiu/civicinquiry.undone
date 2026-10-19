// 權利登記（NEWS_EXPLORER_SPEC §3）。這是「部署設定」，不是題庫作者能改的欄位。未確認的權限預設 false。
export interface RightsPolicy {
  id: string;
  provider: string;
  termsUrl: string | null;
  checkedAt: string | null;
  plan: string;
  displayAllowed: boolean;
  persistAllowed: boolean;
  maxRetentionSeconds: number;
  attributionText: string;
  reviewer: string | null;
  notes: string;
}

export const STUB_RIGHTS: RightsPolicy = {
  id: 'rights-test-stub',
  provider: 'test-stub',
  termsUrl: null,
  checkedAt: null,
  plan: '測試替身（無外部供應商）',
  displayAllowed: true,
  persistAllowed: false,
  maxRetentionSeconds: 0,
  attributionText: '測試資料',
  reviewer: null,
  notes: '僅供開發與驗收；不是任何真實供應商。',
};

/** 即時搜尋只有在「顯示權」已確認時才啟用；否則維持預審清單（R02）。 */
export function liveEnabled(policy: RightsPolicy | undefined): boolean {
  return !!policy && policy.displayAllowed;
}
