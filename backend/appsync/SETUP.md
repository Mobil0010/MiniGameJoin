# AppSync 반영 순서

## 1. Lambda ZIP 업로드

Lambda 콘솔에서 `MiniGameJoinApiHandler` 함수를 엽니다.

1. `Code` 탭에서 `Upload from` → `.zip file`
2. `backend/dist/MiniGameJoinApiHandler.zip` 업로드
3. `Runtime settings` → `Edit`
4. Handler를 `src/index.handler`로 설정

## 2. Lambda 환경 변수

`Configuration` → `Environment variables`에 다음 값을 설정합니다.

```text
USERS_TABLE=MiniGameJoinUsers
ROOMS_TABLE=MiniGameJoinRooms
MATCHES_TABLE=MiniGameJoinMatches
CHAT_MESSAGES_TABLE=MiniGameJoinChatMessages
PLAYER_MATCHES_TABLE=MiniGameJoinPlayerMatches
COGNITO_USER_POOL_ID=ap-northeast-2_wKEL9hhbQ
COGNITO_APP_CLIENT_ID=5icj3sfkbd83t6fdpuas69damg
```

## 3. GraphQL 스키마 등록

AppSync 콘솔에서 `MiniGameJoinApi`를 연 뒤:

1. `Schema` 메뉴로 이동
2. `backend/appsync/schema.graphql` 전체 내용을 붙여넣기
3. `Save schema`

## 4. Lambda 데이터 소스 확인

`Data sources`에서 다음 데이터 소스가 있어야 합니다.

```text
Name: MiniGameJoinLambda
Type: AWS Lambda
Function: MiniGameJoinApiHandler
Region: ap-northeast-2
```

## 5. Direct Lambda Resolver 연결

`Schema`에서 다음 Query와 Mutation 각각에 `Attach resolver`를 선택합니다.

### Query

```text
me
room
listChatMessages
myMatchHistory
matchDetail
```

### Mutation

```text
ensureProfile
updateNickname
deleteMyProfile
createRoom
joinRoom
leaveRoom
setReady
startGame
rollDice
confirmScore
forfeit
heartbeat
claimDisconnectWin
sendChatMessage
```

### Subscription

```text
onRoomChanged
onChatMessage
```

각 Resolver 설정:

```text
Data source: MiniGameJoinLambda
Resolver type: Unit resolver
Runtime: Direct Lambda 또는 mapping template을 사용하지 않는 Lambda resolver
Maximum batching size: 0
```

Subscription Resolver도 동일한 `MiniGameJoinLambda`와 공통 Resolver 코드를
사용합니다. Lambda가 구독 시작 시 해당 사용자가 방 참가자인지 확인하고,
`@aws_subscribe`가 이후 Mutation 결과를 구독자에게 전달합니다.

## 6. 접속 종료 검사 스케줄 활성화

새 Lambda ZIP과 스키마, Resolver가 모두 반영된 뒤 EventBridge Scheduler의
`MiniGameJoinPresenceCheck`를 `Enabled`로 변경합니다.

```text
Schedule: rate(1 minute)
Target: MiniGameJoinApiHandler
Payload: {"source":"minigamejoin.presence-check"}
```

## 7. React 환경 변수

AppSync의 `Settings`에서 GraphQL API URL을 복사합니다.
프로젝트 루트에 `.env.local`을 만들고 다음 값을 입력합니다.

```text
VITE_AWS_REGION=ap-northeast-2
VITE_COGNITO_USER_POOL_ID=ap-northeast-2_wKEL9hhbQ
VITE_COGNITO_APP_CLIENT_ID=5icj3sfkbd83t6fdpuas69damg
VITE_APPSYNC_GRAPHQL_URL=https://실제_API_ID.appsync-api.ap-northeast-2.amazonaws.com/graphql
```

환경변수를 수정한 뒤에는 Vite 개발 서버를 껐다가 다시 실행해야 합니다.
