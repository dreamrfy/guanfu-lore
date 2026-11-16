package app.guanfu.shell.sync

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import app.guanfu.shell.SyncContainer
import java.util.concurrent.TimeUnit

/**
 * 同步调度（架构 §3）：WorkManager 周期同步 + 关键动作后即时同步。
 * 网络约束 CONNECTED；引擎自吞错误（SyncSummary.error），worker 只决定重试与否。
 */
class SyncWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val engine = SyncContainer.engine(applicationContext)
        val summary = engine.run()
        return when {
            summary.ok -> Result.success()
            // 有出队的改动没推上去（可能是网络/服务端抖动）→ 退避重试
            summary.error != null -> Result.retry()
            else -> Result.success()
        }
    }

    companion object {
        private const val PERIODIC = "guanfu-sync-periodic"
        private const val ONESHOT = "guanfu-sync-now"

        /** App 启动时调一次：每 15 分钟有网就同步 */
        fun schedulePeriodic(context: Context) {
            val request = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                PERIODIC,
                ExistingPeriodicWorkPolicy.KEEP,
                request,
            )
        }

        /** 本地改动入队后调：尽快推一次 */
        fun enqueueNow(context: Context) {
            val request = OneTimeWorkRequestBuilder<SyncWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(ONESHOT, ExistingWorkPolicy.REPLACE, request)
        }
    }
}
