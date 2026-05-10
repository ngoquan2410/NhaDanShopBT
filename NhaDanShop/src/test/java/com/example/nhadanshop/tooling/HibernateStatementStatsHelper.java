package com.example.nhadanshop.tooling;

import jakarta.persistence.EntityManager;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;

/**
 * Test-only helper for Phase 0C query-count baselines (Hibernate {@link Statistics}).
 * Not used from production code.
 */
public final class HibernateStatementStatsHelper {

    private HibernateStatementStatsHelper() {}

    public static Statistics statistics(EntityManager entityManager) {
        SessionFactory sf = entityManager.getEntityManagerFactory().unwrap(SessionFactory.class);
        Statistics stats = sf.getStatistics();
        stats.setStatisticsEnabled(true);
        return stats;
    }

    /**
     * Hibernate's cumulative count of JDBC prepared statements issued (includes queries + batches).
     */
    public static long prepareStatementCount(Statistics statistics) {
        return statistics.getPrepareStatementCount();
    }
}
