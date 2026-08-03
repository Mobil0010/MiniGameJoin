# AppSync 반영 순서

## 1. 친구 테이블 생성

AWS 콘솔 → `DynamoDB` → `Tables` → `Create table`에서 다음 테이블을 만듭니다.

```text
Table name: MiniGameJoinFriends
Partition key: ownerUserId (String)
Sort key: friendUserId (String)
Table settings: Default settings
```

별도 GSI는 필요하지 않습니다. 생성 후 Lambda 실행 역할의 인라인 정책을
`backend/iam/lambda-dynamodb-policy.json` 내용으로 교체합니다.

## 2. Lambda ZIP 업로드

Lambda 콘솔에서 `MiniGameJoinApiHandler` 함수를 엽니다.

1. `Code` 탭에서 `Upload from` → `.zip file`
2. `backend/dist/MiniGameJoinApiHandler.zip` 업로드
3. `Runtime settings` → `Edit`
4. Handler를 `src/index.handler`로 설정

## 3. Lambda 환경 변수

`Configuration` → `Environment variables`에 다음 값을 설정합니다.

```text
USERS_TABLE=MiniGameJoinUsers
ROOMS_TABLE=MiniGameJoinRooms
MATCHES_TABLE=MiniGameJoinMatches
CHAT_MESSAGES_TABLE=MiniGameJoinChatMessages
PLAYER_MATCHES_TABLE=MiniGameJoinPlayerMatches
FRIENDS_TABLE=MiniGameJoinFriends
COGNITO_USER_POOL_ID=ap-northeast-2_wKEL9hhbQ
COGNITO_APP_CLIENT_ID=5icj3sfkbd83t6fdpuas69damg
COGNITO_IDENTITY_POOL_ID=ap-northeast-2:실제_Identity_Pool_UUID
```

## 4. GraphQL 스키마 등록

AppSync 콘솔에서 `MiniGameJoinApi`를 연 뒤:

1. `Schema` 메뉴로 이동
2. `backend/appsync/schema.graphql` 전체 내용을 붙여넣기
3. `Save schema`

## 5. Lambda 데이터 소스 확인

`Data sources`에서 다음 데이터 소스가 있어야 합니다.

```text
Name: MiniGameJoinLambda
Type: AWS Lambda
Function: MiniGameJoinApiHandler
Region: ap-northeast-2
```

## 6. Direct Lambda Resolver 연결

`Schema`에서 다음 Query와 Mutation 각각에 `Attach resolver`를 선택합니다.

### Query

```text
me
room
listChatMessages
friendDashboard
searchMembers
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
selectPlayers
startGame
rollDice
confirmScore
forfeit
returnToWaitingRoom
heartbeat
claimDisconnectWin
sendChatMessage
touchPresence
sendFriendRequest
respondFriendRequest
removeFriend
inviteFriendToRoom
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

## 7. 접속 종료 검사 스케줄 활성화

새 Lambda ZIP과 스키마, Resolver가 모두 반영된 뒤 EventBridge Scheduler의
`MiniGameJoinPresenceCheck`를 `Enabled`로 변경합니다.

```text
Schedule: rate(1 minute)
Target: MiniGameJoinApiHandler
Payload: {"source":"minigamejoin.presence-check"}
```

진행 중인 방도 참가자가 4명 미만이면 `joinRoom`으로 입장할 수 있습니다.
게임 시작 후 들어온 참가자는 기존 플레이어와 턴에 영향을 주지 않는 관전자로
추가됩니다.

대기 중인 방에서는 방장이 1P가 되고 첫 번째 입장자가 2P로 자동 배정됩니다.
세 번째 참가자부터는 관전자로 입장합니다. 방장은 대기실에서 플레이어를 교체할
수 있지만, 참가자가 두 명 이상인 방에서 선택된 플레이어 수를 두 명 아래로
줄이는 요청은 Lambda가 거부합니다. 진행 중에는 `selectPlayers`를 사용할 수
없으므로 게임 도중 들어온 참가자는 해당 경기가 끝날 때까지 관전자입니다.

게임 종료 후 `returnToWaitingRoom`으로 같은 방에 복귀할 때는 해당 방의 이전
대기실 채팅과 게임 채팅을 모두 삭제합니다. 방 코드와 참가자 구성은 유지됩니다.

## 8. React 환경 변수

AppSync의 `Settings`에서 GraphQL API URL을 복사합니다.
프로젝트 루트에 `.env.local`을 만들고 다음 값을 입력합니다.

```text
VITE_AWS_REGION=ap-northeast-2
VITE_COGNITO_USER_POOL_ID=ap-northeast-2_wKEL9hhbQ
VITE_COGNITO_APP_CLIENT_ID=5icj3sfkbd83t6fdpuas69damg
VITE_COGNITO_IDENTITY_POOL_ID=ap-northeast-2:실제_Identity_Pool_UUID
VITE_COGNITO_GUEST_ROLE_ARN=arn:aws:iam::621641242785:role/service-role/MiniGameJoinGuestRole
VITE_APPSYNC_GRAPHQL_URL=https://실제_API_ID.appsync-api.ap-northeast-2.amazonaws.com/graphql
```

환경변수를 수정한 뒤에는 Vite 개발 서버를 껐다가 다시 실행해야 합니다.
