import {
  CognitoUserPool,
  CognitoUser,
  CognitoUserAttribute,
  AuthenticationDetails,
  CognitoUserSession,
} from 'amazon-cognito-identity-js'

const poolData = {
  UserPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
  ClientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
}

const userPool = new CognitoUserPool(poolData)

export interface AuthTokens {
  accessToken: string
  idToken: string
  refreshToken: string
}

export const authService = {
  signIn: (username: string, password: string): Promise<AuthTokens> => {
    return new Promise((resolve, reject) => {
      const authenticationDetails = new AuthenticationDetails({
        Username: username,
        Password: password,
      })

      const cognitoUser = new CognitoUser({
        Username: username,
        Pool: userPool,
      })

      cognitoUser.authenticateUser(authenticationDetails, {
        onSuccess: (session: CognitoUserSession) => {
          resolve({
            accessToken: session.getAccessToken().getJwtToken(),
            idToken: session.getIdToken().getJwtToken(),
            refreshToken: session.getRefreshToken().getToken(),
          })
        },
        onFailure: (err) => {
          reject(err)
        },
      })
    })
  },

  signUp: (
    username: string,
    password: string,
    email: string
  ): Promise<any> => {
    return new Promise((resolve, reject) => {
      const attributeList = [
        new CognitoUserAttribute({ Name: 'email', Value: email }),
      ]

      userPool.signUp(
        username,
        password,
        attributeList,
        [],
        (err, result) => {
          if (err) {
            reject(err)
            return
          }
          resolve(result)
        }
      )
    })
  },

  getCurrentUser: (): CognitoUser | null => {
    return userPool.getCurrentUser()
  },

  getCurrentSession: (): Promise<CognitoUserSession> => {
    return new Promise((resolve, reject) => {
      const cognitoUser = userPool.getCurrentUser()

      if (!cognitoUser) {
        reject(new Error('No current user'))
        return
      }

      cognitoUser.getSession((err: Error | null, session: CognitoUserSession | null) => {
        if (err || !session) {
          reject(err)
          return
        }
        resolve(session)
      })
    })
  },

  signOut: () => {
    const cognitoUser = userPool.getCurrentUser()
    if (cognitoUser) {
      cognitoUser.signOut()
    }
  },

  getAccessToken: async (): Promise<string> => {
    const session = await authService.getCurrentSession()
    return session.getAccessToken().getJwtToken()
  },
}
