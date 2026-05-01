# 부부 공동 가계부

정적 웹앱이지만 `Supabase`를 연결하면 데스크톱과 스마트폰에서 같은 데이터를 함께 볼 수 있습니다.

## 1. Supabase 준비

1. [https://supabase.com](https://supabase.com) 에서 프로젝트를 만듭니다.
2. `SQL Editor`에서 [supabase-schema.sql](./supabase-schema.sql)을 실행합니다.
3. `Project Settings > API`에서 `Project URL`과 `anon public key`를 확인합니다.
4. [config.js](./config.js)에 값을 넣습니다.

```js
window.BUDGET_APP_CONFIG = {
  supabaseUrl: "https://YOUR-PROJECT.supabase.co",
  supabaseAnonKey: "YOUR-ANON-KEY"
};
```

## 2. 사용 방법

1. 배포된 페이지에 접속합니다.
2. 둘만 아는 `가계부 코드`와 `PIN`을 입력합니다.
3. 다른 기기에서도 같은 코드와 PIN을 입력하면 같은 가계부가 열립니다.

예시:

- 가계부 코드: `jjcrew-house`
- PIN: `1005`

코드와 PIN은 Supabase에 그대로 저장되지 않고, 브라우저에서 해시한 공유 키로만 사용됩니다.
