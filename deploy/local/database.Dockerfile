FROM postgres:17-bookworm
COPY deploy/local/database-entry.sh /usr/local/bin/ferre-database-entry
COPY deploy/local/init-runtime.sql /docker-entrypoint-initdb.d/10-runtime.sql
RUN chmod 755 /usr/local/bin/ferre-database-entry && chmod 644 /docker-entrypoint-initdb.d/10-runtime.sql
ENTRYPOINT ["ferre-database-entry"]
CMD ["postgres"]
