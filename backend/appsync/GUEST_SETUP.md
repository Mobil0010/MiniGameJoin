# 게스트 온라인 플레이 AWS 설정

이 문서는 `MiniGameJoin`의 회원 로그인 방식은 그대로 유지하면서,
게스트에게만 Cognito Identity Pool 임시 자격 증명과 AppSync IAM 권한을
부여하는 절차입니다.

## 적용되는 고정 정보

```text
Region: ap-northeast-2
AWS account ID: 621641242785
AppSync API ID: alnarmw6fjdf3prs2ovivx76au
AppSync API: MiniGameJoinApi
Lambda: MiniGameJoinApiHandler
```

## 1. Cognito Identity Pool 만들기

1. AWS 콘솔 오른쪽 위 리전을 `서울(ap-northeast-2)`로 맞춥니다.
2. 상단 검색창에서 `Cognito`를 검색해 엽니다.
3. 왼쪽 메뉴에서 `Identity pools(자격 증명 풀)`을 선택합니다.
   `User pools`가 아닙니다.
4. `Create identity pool`을 누릅니다.
5. 이름을 `MiniGameJoinGuestIdentityPool`로 입력합니다.
6. `Guest access` 또는 `Unauthenticated access`에서
   `Enable guest access`를 선택합니다.
7. 이 Identity Pool은 게스트 전용이므로 Google, Facebook 같은 로그인
   공급자는 연결하지 않습니다.
8. 권한 설정에서 `Create a new IAM role`을 선택하고 역할 이름을
   `MiniGameJoinGuestRole`로 입력합니다.
9. 마지막 검토 화면에서 게스트 액세스가 켜져 있는지 확인하고 생성합니다.

생성이 끝나면 Identity Pool 상세 화면의 `Identity pool ID`를 복사합니다.
형식은 아래와 같습니다.

```text
ap-northeast-2:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

## 2. 게스트 IAM 역할에 AppSync 최소 권한 추가

1. AWS 콘솔 검색창에서 `IAM`을 검색해 엽니다.
2. 왼쪽 `Roles(역할)`을 선택합니다.
3. `MiniGameJoinGuestRole`을 검색해 엽니다.
4. `Permissions` 탭 → `Add permissions` →
   `Create inline policy`를 선택합니다.
5. `JSON` 탭을 선택하고 기존 내용을 모두 지운 뒤 아래 내용을 붙여넣습니다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "MiniGameJoinGuestGraphQL",
      "Effect": "Allow",
      "Action": "appsync:GraphQL",
      "Resource": [
        "arn:aws:appsync:ap-northeast-2:621641242785:apis/alnarmw6fjdf3prs2ovivx76au/types/Query/fields/room",
        "arn:aws:appsync:ap-northeast-2:621641242785:apis/alnarmw6fjdf3prs2ovivx76au/types/Query/fields/listChatMessages",
        "arn:aws:appsync:ap-northeast-2:621641242785:apis/alnarmw6fjdf3prs2ovivx76au/types/Mutation/fields/createRoom",
        "arn:aws:appsync:ap-northeast-2:621641242785:apis/alnarmw6fjdf3prs2ovivx76au/types/Mutation/fields/joinRoom",
        "arn:aws:appsync:ap-northeast-2:621641242785:apis/alnarmw6fjdf3prs2ovivx76au/types/Mutation/fields/leaveRoom",
        "arn:aws:appsync:ap-northeast-2:621641242785:apis/alnarmw6fjdf3prs2ovivx76au/types/Mutation/fields/setReady",
        "arn:aws:appsync:ap-northeast-2:621641242785:apis/alnarmw6fjdf3prs2ovivx76au/types/Mutation/fields/selectPlayers",
        "arn:aws:appsync:ap-northeast-2:621641242785:apis/alnarmw6fjdf3prs2ovivx76au/types/Mutation/fields/startGame",
        "arn:aws:appsync:ap-northeast-2:621641242785:apis/alnarmw6fjdf3prs2ovivx76au/types/Mutation/fields/rollDice",
        "arn:aws:appsync:ap-northeast-2:621641242785:apis/alnarmw6fjdf3prs2ovivx76au/types/Mutation/fields/confirmScore",
        "arn:aws:appsync:ap-northeast-2:621641242785:apis/alnarmw6fjdf3prs2ovivx76au/types/Mutation/fields/forfeit",
        "arn:aws:appsync:ap-northeast-2:621641242785:apis/alnarmw6fjdf3prs2ovivx76au/types/Mutation/fields/heartbeat",
        "arn:aws:appsync:ap-northeast-2:621641242785:apis/alnarmw6fjdf3prs2ovivx76au/types/Mutation/fields/claimDisconnectWin",
        "arn:aws:appsync:ap-northeast-2:621641242785:apis/alnarmw6fjdf3prs2ovivx76au/types/Mutation/fields/sendChatMessage"
      ]
    }
  ]
}
```

6. `Next`를 누르고 정책 이름을
   `MiniGameJoinGuestAppSyncPolicy`로 지정한 뒤 생성합니다.

`me`, `ensureProfile`, `updateNickname`, `deleteMyProfile`, 회원 전적 조회
필드는 이 정책에 넣지 않습니다. 따라서 게스트는 회원 프로필과 전적 API를
호출할 권한이 없습니다.

## 2-1. Basic(Classic) 인증 활성화

게스트가 IAM 역할 정책을 직접 적용받아 AppSync를 호출하도록 Identity Pool의
Basic(Classic) 인증을 사용합니다.

1. Cognito → `Identity pools` → `MiniGameJoinGuestIdentityPool`을 엽니다.
2. `Identity pool properties` 탭 또는 카드에서 `Edit`를 누릅니다.
3. `Basic (classic) authentication`을 활성화합니다.
4. `Save changes`를 누릅니다.

게스트 역할의 신뢰 정책은 아래 3번처럼 Identity Pool ID와
`unauthenticated` 조건으로 제한된 상태여야 합니다.

## 3. IAM 역할 신뢰 정책 확인

1. 같은 `MiniGameJoinGuestRole` 화면에서 `Trust relationships` 탭을 엽니다.
2. `cognito-identity.amazonaws.com:aud` 값이 방금 만든 Identity Pool ID인지,
   `amr` 값이 `unauthenticated`인지 확인합니다.
3. Cognito가 역할을 자동 생성했다면 보통 이미 올바르게 설정되어 있습니다.
   다르다면 `Edit trust policy`를 누르고 아래의
   `IDENTITY_POOL_ID`만 실제 값으로 바꿉니다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "cognito-identity.amazonaws.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "cognito-identity.amazonaws.com:aud": "IDENTITY_POOL_ID"
        },
        "ForAnyValue:StringLike": {
          "cognito-identity.amazonaws.com:amr": "unauthenticated"
        }
      }
    }
  ]
}
```

## 4. AppSync에 AWS IAM 추가 인증 켜기

1. AWS 콘솔 검색창에서 `AppSync`를 검색해 엽니다.
2. `APIs` → `MiniGameJoinApi`를 엽니다.
3. 왼쪽 `Settings`를 엽니다.
4. `Authorization modes` 또는 `Authorization configuration`에서
   `Edit`를 누릅니다.
5. 기본 인증이 기존의 `Amazon Cognito User Pool`인지 확인합니다.
   기본 인증은 바꾸지 않습니다.
6. `Additional authorization modes` → `Add authorization mode`를 누릅니다.
7. `AWS Identity and Access Management (IAM)`을 선택합니다.
8. 저장합니다.

## 5. Lambda 환경 변수 추가

Lambda 코드는 보안을 위해 요청의 Identity Pool ID까지 대조합니다.

1. AWS 콘솔 검색창에서 `Lambda`를 검색해 엽니다.
2. `Functions` → `MiniGameJoinApiHandler`를 엽니다.
3. `Configuration` → `Environment variables` → `Edit`를 누릅니다.
4. `Add environment variable`을 누르고 아래 값을 추가합니다.

```text
Key: COGNITO_IDENTITY_POOL_ID
Value: 방금 복사한 실제 Identity Pool ID
```

5. 기존 DynamoDB 테이블 환경 변수는 지우지 말고 `Save`를 누릅니다.

## 6. 새 Lambda ZIP 업로드

프로젝트에서 생성된 파일:

```text
backend/dist/MiniGameJoinApiHandler.zip
```

1. `MiniGameJoinApiHandler`의 `Code` 탭으로 이동합니다.
2. `Upload from` → `.zip file`을 선택합니다.
3. 위 ZIP 파일을 선택해 업로드하고 `Save`합니다.
4. `Runtime settings`의 Handler가 `src/index.handler`인지 확인합니다.

## 7. 새 GraphQL 스키마 적용

1. AWS 콘솔 `AppSync` → `MiniGameJoinApi` → `Schema`로 이동합니다.
2. 프로젝트의 `backend/appsync/schema.graphql` 파일 전체를 복사합니다.
3. 콘솔의 기존 스키마 전체를 교체하고 `Save schema`를 누릅니다.
4. 기존 Resolver는 필드 이름이 유지되므로 다시 만들 필요가 없습니다.
   `createRoom`과 `joinRoom` Resolver도 기존 공통 Lambda Resolver를 그대로
   사용합니다.

## 8. React 환경 변수 입력

프로젝트 루트의 `.env.local`에서 아래 빈 값을 실제 ID로 채웁니다.

```text
VITE_COGNITO_IDENTITY_POOL_ID=ap-northeast-2:실제_UUID
VITE_COGNITO_GUEST_ROLE_ARN=arn:aws:iam::621641242785:role/service-role/MiniGameJoinGuestRole
```

환경 변수 변경 뒤에는 개발 서버를 완전히 종료하고 다시 실행합니다.

```powershell
npm run dev
```

현재처럼 Cloudflare Pages **Direct Upload**를 사용하면 Cloudflare가
소스 코드를 빌드하지 않으므로 대시보드 환경 변수는 사용하지 않습니다.
로컬 `.env.local`에 값을 넣고 `npm run build`를 다시 실행한 다음, 새로
생긴 `dist` 폴더를 Direct Upload 해야 합니다.

나중에 Git 연동 배포로 바꾸는 경우에만 Cloudflare Pages 프로젝트의
`Settings → Variables and Secrets`에 같은 환경 변수를 추가합니다.

## 9. 최종 확인

서로 다른 브라우저 또는 일반 창과 시크릿 창을 사용합니다.

1. 첫 번째 창: `게스트` → 닉네임 입력 → `방 만들기`
2. 두 번째 창: 회원 또는 다른 게스트로 접속 → 초대 코드 입력
3. 준비 완료 → 게임 시작
4. 양쪽에서 주사위, 점수 확정, 채팅 확인
5. 게스트가 포함된 경기가 끝난 뒤 회원 전적이 증가하지 않는지 확인

게스트는 회원가입 없이 게임방, 주사위, 점수, 채팅, 기권, 연결 종료 판정을
사용할 수 있습니다. 게스트가 포함된 경기는 전적 조작을 막기 위해 양쪽 모두
회원 승패 통계에 반영하지 않습니다.
