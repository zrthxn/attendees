import firebase from 'firebase/app'
import 'firebase/database'
import 'firebase/auth'
import 'firebase/firestore'

import DatabaseConfig from '../../auth/firebase.config.json'

if (firebase.apps.length===0)
  firebase.initializeApp(DatabaseConfig)

export const database = firebase.database()

export const firestore = firebase.firestore()

export default firebase
/**
* @author Alisamar Husain
* 
* Standard Firebase/Firestore Export
* ---------------------------------
* Import the object by either
*   const db = require('./Database')
* or
*   import db from './Database'
* 
* Use the object to get a database
* namespace by 'db.firebase.database()'
* Check the firebase docs for more.
*/