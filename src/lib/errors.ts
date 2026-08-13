/** 登录状态已失效（Cookie 过期或被踢下线）。
 * 由引擎层抛出，命令层负责决定提示语与退出码。 */
export class LoginExpiredError extends Error {
  constructor(message = '登录状态已失效，请重新运行 start 命令登录') {
    super(message);
    this.name = 'LoginExpiredError';
  }
}
