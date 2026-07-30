import { util } from '@aws-appsync/utils'

export function request(ctx) {
  return {
    operation: 'Invoke',
    payload: {
      fieldName: ctx.info.fieldName,
      arguments: ctx.args,
      identity: ctx.identity,
    },
  }
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type, ctx.result)
  }

  return ctx.result
}
