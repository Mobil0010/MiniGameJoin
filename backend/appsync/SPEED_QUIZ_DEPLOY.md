# 스피드 퀴즈 운영 배포

스피드 퀴즈는 기존 AppSync API, Lambda, DynamoDB Rooms 테이블을 그대로 사용합니다.
새 AWS 리소스나 환경 변수는 필요 없습니다. 아래 순서만 지켜서 배포합니다.

## 1. Lambda 코드 업로드

업로드 파일:

```text
backend/dist/MiniGameJoinApiHandler.zip
```

AWS 콘솔에서 `Lambda → MiniGameJoinApiHandler → Code → Upload from → .zip file`로
업로드하고 Handler가 `src/index.handler`인지 확인합니다.

## 2. AppSync 스키마 교체

`AppSync → MiniGameJoinApi → Schema`에서 현재 스키마를 백업한 뒤,
`backend/appsync/schema.graphql`의 전체 내용으로 교체하고 저장합니다.

## 3. 신규 Resolver 3개 연결

다음 필드에 기존 `MiniGameJoinLambda` 데이터 소스를 연결합니다.

```text
Query.speedQuizPrompt
Mutation.startSpeedQuizTurn
Mutation.scoreSpeedQuizPrompt
```

각 필드의 `Attach resolver`에서 Runtime을 `APPSYNC_JS`, Maximum batching size를
`0`으로 선택하고 `backend/appsync/resolvers/lambda-unit-resolver.js`의 전체 코드를
붙여넣습니다. Subscription은 스키마의 `@aws_subscribe`가 처리하므로 새 Resolver가
필요 없습니다.

## 4. 게스트 IAM 권한 추가

게스트 플레이를 사용하는 경우 `IAM → Roles → MiniGameJoinGuestRole →
MiniGameJoinGuestAppSyncPolicy`의 기존 `Resource` 배열에 아래 ARN 3개를 추가합니다.

```text
arn:aws:appsync:ap-northeast-2:621641242785:apis/alnarmw6fjdf3prs2ovivx76au/types/Query/fields/speedQuizPrompt
arn:aws:appsync:ap-northeast-2:621641242785:apis/alnarmw6fjdf3prs2ovivx76au/types/Mutation/fields/startSpeedQuizTurn
arn:aws:appsync:ap-northeast-2:621641242785:apis/alnarmw6fjdf3prs2ovivx76au/types/Mutation/fields/scoreSpeedQuizPrompt
```

회원만 사용할 경우 이 단계는 필요 없습니다. 기존 ARN은 제거하지 않습니다.

## 5. 프런트엔드 배포

AWS 1~4단계를 마친 뒤 프로젝트 루트의 `dist` 폴더를 Cloudflare Pages에
Direct Upload합니다. 새 환경 변수와 Android APK 업데이트는 필요 없습니다.
Android 앱은 배포된 웹 화면을 WebView로 불러오므로 웹 배포 후 바로 반영됩니다.

## 6. 운영 확인

서로 다른 브라우저 4개(일반/시크릿 창 또는 실제 기기)를 사용합니다.

1. 스피드 퀴즈 방을 만들고 총 4명이 입장합니다.
2. A/B 팀이 2명씩 표시되고 4명 전원이 준비해야 시작되는지 확인합니다.
3. 설명자에게만 제시어가 보이는지 확인합니다.
4. 정답 점수, 패스 3회 제한, 60초 종료와 다음 팀 전환을 확인합니다.
5. 총 6차례 후 승리 팀 또는 무승부가 표시되는지 확인합니다.
6. 같은 방에서 다시 하기가 정상 작동하는지 확인합니다.

오류가 나면 CloudWatch Logs의 `MiniGameJoinApiHandler` 로그와 AppSync Resolver 연결
상태를 먼저 확인합니다. `Cannot query field`는 스키마 미적용, `Permission denied`는
게스트 IAM ARN 누락, `지원하지 않는 GraphQL 작업`은 Lambda ZIP 미적용입니다.
