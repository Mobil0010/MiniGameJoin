# MiniGameJoin serverless backend

온라인 Yacht Dice와 가위바위보 서버에서 사용하는 AppSync 스키마와 Lambda 코드입니다.

## 구성

- `appsync/schema.graphql`: AppSync에 등록할 GraphQL 스키마
- `appsync/SETUP.md`: AWS 콘솔에 코드와 Resolver를 반영하는 순서
- `lambda/game-api`: AppSync Lambda 데이터 소스에 연결할 함수
- `iam/lambda-dynamodb-policy.json`: Lambda 실행 역할용 최소 권한 예시
- `scripts/build-lambda.ps1`: Lambda 업로드용 ZIP 생성

## 환경 변수

Lambda 함수에 다음 환경 변수가 필요합니다.

```text
USERS_TABLE=MiniGameJoinUsers
ROOMS_TABLE=MiniGameJoinRooms
MATCHES_TABLE=MiniGameJoinMatches
CHAT_MESSAGES_TABLE=MiniGameJoinChatMessages
PLAYER_MATCHES_TABLE=MiniGameJoinPlayerMatches
GAME_STATS_TABLE=MiniGameJoinGameStats
COGNITO_USER_POOL_ID=ap-northeast-2_wKEL9hhbQ
COGNITO_APP_CLIENT_ID=5icj3sfkbd83t6fdpuas69damg
COGNITO_IDENTITY_POOL_ID=ap-northeast-2:실제_Identity_Pool_UUID
```

## 보안 원칙

- 회원 ID는 AppSync의 `identity.sub`, 게스트 ID는 검증된
  `identity.cognitoIdentityId`를 사용합니다.
- 주사위 값과 점수는 Lambda에서 계산합니다.
- 가위바위보 선택은 공개 전까지 비공개 방 필드에 저장하고 서버에서 판정합니다.
- 가위바위보 제한시간이 끝나면 미선택 플레이어의 손을 서버에서 무작위 선택합니다.
- 방 상태 변경에는 `version` 조건을 사용해 중복 요청을 차단합니다.
- 경기 결과와 회원 전적은 DynamoDB 트랜잭션으로 함께 기록합니다.
- 게임별 누적 전적은 `userId + gameId` 키로 분리해 새 게임도 같은 구조로 추가합니다.
- 게스트가 참가한 경기는 회원 전적에 반영하지 않습니다.
- 채팅은 방 참가자만 읽고 쓸 수 있으며 7일 TTL로 정리합니다.
- 진행 중인 방은 heartbeat와 90초 유예시간으로 접속 종료를 판정합니다.

## Lambda ZIP 다시 만들기

PowerShell 실행 정책 때문에 스크립트가 바로 실행되지 않으면 프로젝트
루트에서 다음 명령을 사용합니다.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\backend\scripts\build-lambda.ps1"
```
