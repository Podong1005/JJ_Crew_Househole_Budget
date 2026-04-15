# 부부 공동 가계부

정적 웹앱이지만 `Supabase`를 연결하면 아내와 내가 각자 폰이나 컴퓨터에서 같은 데이터를 함께 볼 수 있습니다.

## 1. Supabase 준비

1. [https://supabase.com](https://supabase.com) 에서 새 프로젝트를 만듭니다.
2. `SQL Editor`에서 [supabase-schema.sql](./supabase-schema.sql)을 실행합니다.
3. `Authentication > Providers > Email`을 켭니다.
4. `Project Settings > API`에서 `Project URL`과 `anon public key`를 확인합니다.

## 2. 앱 연결

1. [config.js](./config.js)에 아래처럼 값을 넣습니다.

```js
window.BUDGET_APP_CONFIG = {
  supabaseUrl: "https://YOUR-PROJECT.supabase.co",
  supabaseAnonKey: "YOUR-ANON-KEY"
};
```

2. `index.html`을 열어 로그인 또는 회원가입을 합니다.
3. 한 분이 새 가계부를 만들고, 나온 초대 코드를 다른 분에게 공유합니다.
4. 다른 분은 같은 초대 코드를 입력해 참여합니다.

## 3. 같이 접속하기

둘 다 각자 기기에서 접속하려면 이 폴더를 웹에 올려야 합니다.

- 가장 쉬운 방법: GitHub Pages
- 대안: Netlify, Vercel

배포 후 같은 URL로 접속하면 실시간으로 같은 가계부를 함께 사용할 수 있습니다.
