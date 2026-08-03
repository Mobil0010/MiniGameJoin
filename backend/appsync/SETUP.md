# 기존 AWS 환경에 가위바위보 업데이트 적용하기

이 문서는 이미 운영 중인 `MiniGameJoin` AWS 환경에 가위바위보와 게임별 전적을
추가하는 절차입니다. 기존 리소스를 다시 만들지 않습니다.

## 적용 대상

```text
Region: ap-northeast-2 (서울)
AWS account ID: 621641242785
AppSync API: MiniGameJoinApi
AppSync API ID: alnarmw6fjdf3prs2ovivx76au
Lambda: MiniGameJoinApiHandler
Lambda data source: MiniGameJoinLambda
```

작업을 시작하기 전에 콘솔 오른쪽 위 리전이 `서울(ap-northeast-2)`인지 먼저
확인합니다. 다른 리전에서는 같은 이름의 리소스가 보이지 않거나 새로 만들게 될
수 있으므로 주의합니다.

## 이번 업데이트에서 실제로 필요한 변경

이번에 새로 필요한 것은 아래 항목뿐입니다.

1. DynamoDB `MiniGameJoinGameStats` 테이블 1개
2. Lambda 환경 변수 `GAME_STATS_TABLE` 1개와 실행 역할 권한 1개
3. AppSync 신규 Resolver 4개
4. 게스트 IAM 정책의 가위바위보 Mutation 권한 3개

다음 리소스는 이미 있다면 다시 만들거나 삭제하지 않습니다.

```text
MiniGameJoinUsers
MiniGameJoinRooms
MiniGameJoinMatches
MiniGameJoinChatMessages
MiniGameJoinPlayerMatches
MiniGameJoinFriends
MiniGameJoinLambda
MiniGameJoinGuestIdentityPool
MiniGameJoinGuestRole
MiniGameJoinPresenceCheck
```

기존 DynamoDB 테이블의 키, TTL, GSI도 변경할 필요가 없습니다. 기존 요트 다이스
방과 경기 기록을 삭제하거나 직접 수정할 필요도 없습니다.

## 0. 변경 전 백업

배포 직전 다음 두 항목을 보관해두면 문제가 생겼을 때 쉽게 되돌릴 수 있습니다.

1. Lambda → `MiniGameJoinApiHandler` → `Code` → `Actions` →
   `Export function`에서 현재 ZIP 다운로드
2. AppSync → `MiniGameJoinApi` → `Schema`에서 기존 스키마 전체를 별도 파일에 복사

테이블을 삭제하거나 데이터를 내보낼 필요는 없습니다.

## 1. 기존 DynamoDB 테이블 확인

AWS 콘솔 → DynamoDB → `Tables`에서 아래 테이블이 있는지 확인합니다.

```text
MiniGameJoinUsers
MiniGameJoinRooms
MiniGameJoinMatches
MiniGameJoinChatMessages
MiniGameJoinPlayerMatches
MiniGameJoinFriends
```

이미 존재하는 테이블은 아무 작업도 하지 않습니다. `Create table`을 누르지 않고
다음 단계로 넘어갑니다. 목록에서 기존 테이블이 빠져 있다면 바로 새로 만들지
말고 현재 리전과 AWS 계정이 맞는지 먼저 확인합니다.

### MiniGameJoinGameStats 확인 또는 생성

같은 목록에서 `MiniGameJoinGameStats`를 찾습니다.

- 이미 있으면 테이블을 열어 키가 아래와 같은지만 확인하고 생성을 건너뜁니다.
- 없을 때만 `Create table`을 누릅니다.

```text
Table name: MiniGameJoinGameStats
Partition key: userId (String)
Sort key: gameId (String)
Table settings: Default settings
```

생성 후 상태가 `Active`가 될 때까지 기다립니다. 이 테이블에는 TTL과 GSI가
필요하지 않습니다.

같은 이름의 테이블이 있지만 키가 다르다면 삭제하거나 다시 만들지 말고 작업을
중단합니다. 기존 데이터 존재 여부를 확인한 뒤 별도 마이그레이션이 필요합니다.

기존 전적은 직접 옮기지 않아도 됩니다.

- `MiniGameJoinUsers`에 저장된 기존 요트 다이스 승·패는 첫 조회와 첫 전적 갱신의
  기준값으로 사용됩니다.
- `MiniGameJoinPlayerMatches`의 예전 기록에 `gameId`가 없어도 서버가
  `yacht-dice` 기록으로 처리합니다.
- 가위바위보 전적은 `gameId=rock-paper-scissors`로 별도 저장됩니다.

## 2. Lambda 실행 역할 권한 갱신

새 코드 업로드 전에 권한을 먼저 반영합니다.

1. Lambda → `MiniGameJoinApiHandler` → `Configuration` → `Permissions`
2. `Execution role`에 표시된 역할 이름을 클릭
3. IAM 역할의 `Permissions`에서 MiniGameJoin DynamoDB 인라인 정책을 엽니다.
4. `Edit` → `JSON`에서 프로젝트의
   `backend/iam/lambda-dynamodb-policy.json` 내용으로 교체
5. 변경 사항 저장

기존 정책을 직접 수정한다면 최소한 아래 ARN이 Item 접근과 Query 접근 Resource에
모두 포함되어야 합니다.

```text
arn:aws:dynamodb:ap-northeast-2:621641242785:table/MiniGameJoinGameStats
```

기존 테이블 ARN이나 기존 권한은 제거하지 않습니다.

## 3. Lambda 환경 변수 1개 추가

1. Lambda → `MiniGameJoinApiHandler`
2. `Configuration` → `Environment variables` → `Edit`
3. 기존 환경 변수는 그대로 둡니다.
4. 아래 항목만 추가하고 저장합니다.

```text
Key: GAME_STATS_TABLE
Value: MiniGameJoinGameStats
```

저장 후 최종 목록에 다음 키들이 모두 남아 있는지 확인합니다. 값은 현재 운영
환경의 기존 값을 유지합니다.

```text
USERS_TABLE
ROOMS_TABLE
MATCHES_TABLE
CHAT_MESSAGES_TABLE
PLAYER_MATCHES_TABLE
GAME_STATS_TABLE
FRIENDS_TABLE
COGNITO_IDENTITY_POOL_ID
```

`COGNITO_USER_POOL_ID`와 `COGNITO_APP_CLIENT_ID`가 이미 있다면 그대로 두면 됩니다.
현재 Lambda 코드는 두 값을 필수로 읽지는 않지만 삭제할 이유도 없습니다.

## 4. 최신 Lambda ZIP 업로드

업로드할 파일은 다음 경로에 이미 생성되어 있습니다.

```text
backend/dist/MiniGameJoinApiHandler.zip
```

1. Lambda → `MiniGameJoinApiHandler` → `Code`
2. `Upload from` → `.zip file`
3. `MiniGameJoinApiHandler.zip` 선택 후 `Save`
4. `Runtime settings`의 Handler가 `src/index.handler`인지 확인
5. `Configuration` → `General configuration`에서 Timeout이 너무 짧지 않은지 확인
   - 권장: 10초 이상

이 Lambda 코드는 기존 AppSync 스키마의 요트 다이스 요청도 계속 처리하므로,
스키마보다 먼저 업로드해도 됩니다.

## 5. AppSync 스키마 갱신

1. AppSync → `MiniGameJoinApi` → `Schema`
2. 프로젝트의 `backend/appsync/schema.graphql` 전체 내용을 복사
3. 콘솔의 기존 스키마 전체를 교체
4. `Save schema`
5. 저장 완료 메시지가 나타나는지 확인

기존 필드 이름은 유지되므로 기존 Resolver를 다시 만들 필요가 없습니다.
스키마 저장 후 Resolver 목록에서 기존 필드가 연결된 상태인지 확인만 합니다.

이번 스키마의 주요 변경은 다음과 같습니다.

- `Room`에 가위바위보 설정·라운드·공개 결과 필드 추가
- `createRoom`에 선택적 `gameId` 인수 추가
- `myMatchHistory`에 필수 `gameId` 인수 추가
- 게임별 통계 Query와 가위바위보 Mutation 추가

## 6. 신규 AppSync Resolver 4개 연결

아래 필드만 새 Resolver가 필요합니다.

```text
Query.myGameStats
Mutation.updateRpsSettings
Mutation.submitRpsHand
Mutation.advanceRpsRound
```

각 필드마다 다음 순서로 연결합니다.

1. AppSync → `MiniGameJoinApi` → `Schema`
2. 해당 필드를 검색하고 `Attach resolver` 선택
3. Data source로 기존 `MiniGameJoinLambda` 선택
4. Runtime은 `APPSYNC_JS`를 선택
5. 프로젝트의 `backend/appsync/resolvers/lambda-unit-resolver.js` 전체 내용을
   Resolver code에 붙여넣기
6. Maximum batching size는 `0`
7. 저장

공통 Resolver 코드는 요청 필드명, 인수, 로그인 정보를 Lambda로 전달합니다.
새 Lambda 함수나 새 AppSync Data source를 만들 필요가 없습니다.

다음 기존 Resolver들은 이미 연결되어 있다면 건드리지 않습니다.

```text
Query.me
Query.room
Query.listChatMessages
Query.friendDashboard
Query.searchMembers
Query.myMatchHistory
Query.matchDetail

Mutation.ensureProfile
Mutation.updateNickname
Mutation.deleteMyProfile
Mutation.createRoom
Mutation.joinRoom
Mutation.leaveRoom
Mutation.setReady
Mutation.selectPlayers
Mutation.startGame
Mutation.rollDice
Mutation.confirmScore
Mutation.forfeit
Mutation.returnToWaitingRoom
Mutation.heartbeat
Mutation.claimDisconnectWin
Mutation.sendChatMessage
Mutation.touchPresence
Mutation.sendFriendRequest
Mutation.respondFriendRequest
Mutation.removeFriend
Mutation.inviteFriendToRoom

Subscription.onRoomChanged
Subscription.onChatMessage
```

`Subscription.onRoomChanged`는 스키마의 `@aws_subscribe` 설정을 통해 새 가위바위보
Mutation 결과도 전달합니다. 기존 Subscription Resolver를 다시 만들 필요는
없습니다.

## 7. 게스트 IAM 정책에 가위바위보 권한 추가

회원은 Cognito User Pool 인증을 사용하므로 이 단계가 필요 없습니다. 게스트
플레이를 사용 중인 현재 환경에서는 `MiniGameJoinGuestRole` 정책을 갱신해야
합니다.

1. IAM → `Roles` → `MiniGameJoinGuestRole`
2. `MiniGameJoinGuestAppSyncPolicy` 인라인 정책 열기
3. `Edit` → `JSON`
4. 기존 `Resource` 배열에 아래 세 ARN을 추가
5. 저장

```text
arn:aws:appsync:ap-northeast-2:621641242785:apis/alnarmw6fjdf3prs2ovivx76au/types/Mutation/fields/updateRpsSettings
arn:aws:appsync:ap-northeast-2:621641242785:apis/alnarmw6fjdf3prs2ovivx76au/types/Mutation/fields/submitRpsHand
arn:aws:appsync:ap-northeast-2:621641242785:apis/alnarmw6fjdf3prs2ovivx76au/types/Mutation/fields/advanceRpsRound
```

`Query.myGameStats`와 전적 Query는 회원 전용이므로 게스트 역할에 추가하지
않습니다. 기존 게스트 AppSync ARN은 제거하지 않습니다. 전체 정책 예시는
`backend/appsync/GUEST_SETUP.md`에 있습니다.

## 8. EventBridge Scheduler 확인

기존 `MiniGameJoinPresenceCheck`가 있으면 새로 만들지 않습니다.

EventBridge Scheduler에서 다음 값만 확인합니다.

```text
Name: MiniGameJoinPresenceCheck
State: Enabled
Schedule: rate(1 minute)
Target: MiniGameJoinApiHandler
Payload: {"source":"minigamejoin.presence-check"}
```

가위바위보 제한시간 진행은 클라이언트의 `advanceRpsRound` 요청으로 처리됩니다.
이 스케줄의 Payload나 주기를 가위바위보 때문에 변경할 필요는 없습니다.

## 9. 프런트엔드 빌드 및 배포

이번 업데이트에는 새로운 `VITE_` 환경 변수가 없습니다. 기존 `.env.local`을
그대로 사용합니다.

```powershell
npm.cmd run build
```

현재처럼 Cloudflare Pages Direct Upload를 사용한다면 새로 생성된 프로젝트 루트의
`dist` 폴더를 업로드합니다. AWS 작업이 모두 끝나기 전에 새 프런트엔드를 먼저
배포하면 아직 없는 GraphQL 필드를 호출해 오류가 날 수 있으므로 프런트 배포를
마지막에 합니다.

## 10. 배포 후 확인

### AWS 설정 확인

- DynamoDB `MiniGameJoinGameStats` 상태가 `Active`
- Lambda 환경 변수에 `GAME_STATS_TABLE=MiniGameJoinGameStats` 존재
- Lambda 실행 역할이 `MiniGameJoinGameStats`를 읽고 쓸 수 있음
- AppSync 신규 Resolver 4개가 `MiniGameJoinLambda`에 연결됨
- 게스트 역할에 가위바위보 Mutation 3개가 추가됨

### 회원끼리 가위바위보 확인

서로 다른 브라우저 또는 일반 창과 시크릿 창에서 각각 회원으로 로그인합니다.

1. 가위바위보 → 방 만들기
2. 두 번째 회원이 코드로 참가
3. 양쪽 준비 완료 후 게임 시작
4. 가위·바위·보 선택이 공개 전까지 상대에게 보이지 않는지 확인
5. 게임 종료 후 같은 방 대기실로 돌아가기
6. `전적 상세`에서 가위바위보 탭의 승·패가 증가했는지 확인
7. Yacht Dice 탭의 기존 전적이 섞이지 않았는지 확인

### 게스트 확인

1. 게스트로 가위바위보 방 생성 또는 참가
2. 규칙 변경, 손 선택, 자동 다음 라운드 진행 확인
3. 게스트가 포함된 경기가 회원 전적에 반영되지 않는지 확인

### 기존 Yacht Dice 회귀 확인

1. Yacht Dice 방 생성과 참가
2. 준비, 주사위 굴리기, 점수 확정
3. 종료 후 Yacht Dice 전적만 증가하는지 확인
4. 이전 Yacht Dice 경기 기록이 Yacht Dice 탭에 표시되는지 확인

## 11. 문제 발생 시 확인 순서

### Lambda가 시작부터 실패하는 경우

CloudWatch Logs에서 `GAME_STATS_TABLE` 환경 변수 오류가 보이면 Lambda 환경 변수에
아래 값이 있는지 확인합니다.

```text
GAME_STATS_TABLE=MiniGameJoinGameStats
```

### AccessDeniedException

Lambda 오류라면 실행 역할 정책, 게스트 요청만 실패한다면
`MiniGameJoinGuestRole`의 AppSync 정책을 확인합니다.

### Cannot return null for non-nullable field

Lambda와 AppSync 스키마의 버전이 서로 다른 상태일 가능성이 큽니다. 이 저장소의
최신 Lambda ZIP과 `schema.graphql`을 모두 적용합니다.

### 새 Query 또는 Mutation에 Resolver가 없다는 오류

`myGameStats`, `updateRpsSettings`, `submitRpsHand`, `advanceRpsRound` 네 필드에
`MiniGameJoinLambda` Resolver가 연결되었는지 확인합니다.

### 게스트만 가위바위보 요청이 거부되는 경우

`MiniGameJoinGuestAppSyncPolicy`에 7단계의 세 Mutation ARN이 모두 있는지
확인합니다.

## 12. 롤백

문제가 생기면 다음 순서로 되돌립니다.

1. 프런트엔드를 직전 정상 `dist`로 재배포
2. AppSync 스키마를 0단계에서 복사한 이전 스키마로 복원
3. Lambda를 0단계에서 내려받은 이전 ZIP으로 복원

`MiniGameJoinGameStats` 테이블은 롤백 중 삭제하지 않습니다. 이미 기록된 데이터가
있을 수 있으며, 테이블과 추가 IAM 권한·환경 변수는 이전 Lambda 동작을 방해하지
않습니다.
