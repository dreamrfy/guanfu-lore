package app.guanfu.shell

import app.guanfu.shell.db.AppDatabase
import app.guanfu.shell.sync.HttpSyncApi
import app.guanfu.shell.sync.RoomSyncStore
import app.guanfu.shell.sync.SyncEngine

/**
 * 手工装配（无 DI 框架，A02 风格延续）：db + api + engine 各建一份全局复用。
 * api 的 baseUrl/token 每次调用时从 Credentials 取——设置页改完即刻生效，不用重建引擎。
 */
object SyncContainer {

    @Volatile
    private var engine: SyncEngine? = null

    fun engine(context: android.content.Context): SyncEngine =
        engine ?: synchronized(this) {
            engine ?: create(context.applicationContext).also { engine = it }
        }

    private fun create(context: android.content.Context): SyncEngine {
        val db = AppDatabase.get(context)
        val api = HttpSyncApi(
            baseUrlProvider = { Credentials.load(context).serverUrl },
            tokenProvider = { Credentials.load(context).token },
        )
        return SyncEngine(
            store = RoomSyncStore(db),
            api = api,
            deviceIdProvider = { Credentials.load(context).deviceId },
        )
    }
}
