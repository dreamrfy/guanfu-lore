package app.guanfu.shell.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

/**
 * 本地数据库（架构 §2）。Room version = 1 起步；
 * 字段变更一律新开 version(n) 并写迁移——继承 web db.ts 头注纪律。
 *
 * 8 表：pages / docs / collections / records / assets / outbox / sync_conflicts / key_values
 * （web Dexie 的 pages+docs+collections+records+assets+outbox+syncConflicts+meta 1:1 复刻）
 */
@Database(
    entities = [
        PageEntity::class,
        DocEntity::class,
        CollectionEntity::class,
        RecordEntity::class,
        AssetEntity::class,
        OutboxEntity::class,
        SyncConflictEntity::class,
        KeyValueEntity::class,
    ],
    version = 1,
    exportSchema = false,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun pageDao(): PageDao
    abstract fun docDao(): DocDao
    abstract fun collectionDao(): CollectionDao
    abstract fun recordDao(): RecordDao
    abstract fun assetDao(): AssetDao
    abstract fun outboxDao(): OutboxDao
    abstract fun syncConflictDao(): SyncConflictDao
    abstract fun keyValueDao(): KeyValueDao

    companion object {
        @Volatile
        private var instance: AppDatabase? = null

        fun get(context: Context): AppDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "guanfu.db",
                ).build().also { instance = it }
            }
    }
}
