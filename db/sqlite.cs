// Minimal SQLite binding. Windows PowerShell loads db\native\*\sqlite3.dll.
// PowerShell 7 on Linux uses the system libsqlite3 (Docker installs it).
using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;

namespace Gulzat.Data
{
    internal static class Native
    {
        private const string Lib = "sqlite3";

        [DllImport("kernel32", CharSet = CharSet.Unicode, SetLastError = true)]
        internal static extern IntPtr LoadLibrary(string path);

        [DllImport(Lib, CallingConvention = CallingConvention.Cdecl)] internal static extern IntPtr sqlite3_libversion();
        [DllImport(Lib, CallingConvention = CallingConvention.Cdecl)] internal static extern int sqlite3_open_v2(byte[] filename, out IntPtr db, int flags, IntPtr vfs);
        [DllImport(Lib, CallingConvention = CallingConvention.Cdecl)] internal static extern int sqlite3_close_v2(IntPtr db);
        [DllImport(Lib, CallingConvention = CallingConvention.Cdecl)] internal static extern int sqlite3_busy_timeout(IntPtr db, int ms);
        [DllImport(Lib, CallingConvention = CallingConvention.Cdecl)] internal static extern int sqlite3_exec(IntPtr db, byte[] sql, IntPtr callback, IntPtr arg, out IntPtr errmsg);
        [DllImport(Lib, CallingConvention = CallingConvention.Cdecl)] internal static extern void sqlite3_free(IntPtr p);
        [DllImport(Lib, CallingConvention = CallingConvention.Cdecl)] internal static extern IntPtr sqlite3_errmsg(IntPtr db);
        [DllImport(Lib, CallingConvention = CallingConvention.Cdecl)] internal static extern int sqlite3_changes(IntPtr db);
        [DllImport(Lib, CallingConvention = CallingConvention.Cdecl)] internal static extern int sqlite3_get_autocommit(IntPtr db);
        [DllImport(Lib, CallingConvention = CallingConvention.Cdecl)] internal static extern int sqlite3_prepare_v2(IntPtr db, IntPtr sql, int nByte, out IntPtr stmt, out IntPtr tail);
        [DllImport(Lib, CallingConvention = CallingConvention.Cdecl)] internal static extern int sqlite3_step(IntPtr stmt);
        [DllImport(Lib, CallingConvention = CallingConvention.Cdecl)] internal static extern int sqlite3_finalize(IntPtr stmt);
        [DllImport(Lib, CallingConvention = CallingConvention.Cdecl)] internal static extern int sqlite3_bind_parameter_count(IntPtr stmt);
        [DllImport(Lib, CallingConvention = CallingConvention.Cdecl)] internal static extern IntPtr sqlite3_bind_parameter_name(IntPtr stmt, int index);
        [DllImport(Lib, CallingConvention = CallingConvention.Cdecl)] internal static extern int sqlite3_bind_null(IntPtr stmt, int index);
        [DllImport(Lib, CallingConvention = CallingConvention.Cdecl)] internal static extern int sqlite3_bind_int64(IntPtr stmt, int index, long value);
        [DllImport(Lib, CallingConvention = CallingConvention.Cdecl)] internal static extern int sqlite3_bind_double(IntPtr stmt, int index, double value);
        [DllImport(Lib, CallingConvention = CallingConvention.Cdecl)] internal static extern int sqlite3_bind_text(IntPtr stmt, int index, byte[] value, int n, IntPtr destructor);
        [DllImport(Lib, CallingConvention = CallingConvention.Cdecl)] internal static extern int sqlite3_bind_blob(IntPtr stmt, int index, byte[] value, int n, IntPtr destructor);
        [DllImport(Lib, CallingConvention = CallingConvention.Cdecl)] internal static extern int sqlite3_bind_zeroblob(IntPtr stmt, int index, int n);
        [DllImport(Lib, CallingConvention = CallingConvention.Cdecl)] internal static extern int sqlite3_column_count(IntPtr stmt);
        [DllImport(Lib, CallingConvention = CallingConvention.Cdecl)] internal static extern IntPtr sqlite3_column_name(IntPtr stmt, int index);
        [DllImport(Lib, CallingConvention = CallingConvention.Cdecl)] internal static extern int sqlite3_column_type(IntPtr stmt, int index);
        [DllImport(Lib, CallingConvention = CallingConvention.Cdecl)] internal static extern long sqlite3_column_int64(IntPtr stmt, int index);
        [DllImport(Lib, CallingConvention = CallingConvention.Cdecl)] internal static extern double sqlite3_column_double(IntPtr stmt, int index);
        [DllImport(Lib, CallingConvention = CallingConvention.Cdecl)] internal static extern IntPtr sqlite3_column_text(IntPtr stmt, int index);
        [DllImport(Lib, CallingConvention = CallingConvention.Cdecl)] internal static extern IntPtr sqlite3_column_blob(IntPtr stmt, int index);
        [DllImport(Lib, CallingConvention = CallingConvention.Cdecl)] internal static extern int sqlite3_column_bytes(IntPtr stmt, int index);
    }

    public class SqliteException : Exception
    {
        public int Code { get; private set; }
        public SqliteException(int code, string message) : base("SQLite error " + code + ": " + message) { Code = code; }
    }

    // One connection per thread: the server's main loop owns a writer, every chat thread opens its own.
    public sealed class SqliteDb : IDisposable
    {
        private const int SQLITE_OK = 0;
        private const int SQLITE_ROW = 100;
        private const int SQLITE_DONE = 101;
        private static readonly IntPtr Transient = new IntPtr(-1);
        private static readonly object LoadLock = new object();
        private static bool loaded;
        private IntPtr handle;

        public string Path { get; private set; }
        public int Changes { get; private set; }

        public static string Load(string nativeRoot)
        {
            lock (LoadLock)
            {
                if (!loaded)
                {
                    // 4 Unix, 6 MacOSX, 128 the old Mono value. Everywhere else is Windows.
                    int platform = (int)Environment.OSVersion.Platform;
                    if (platform != 4 && platform != 6 && platform != 128)
                    {
                        string arch = Environment.Is64BitProcess ? "x64" : "x86";
                        string file = System.IO.Path.Combine(System.IO.Path.Combine(nativeRoot, arch), "sqlite3.dll");
                        if (Native.LoadLibrary(file) == IntPtr.Zero)
                        {
                            throw new InvalidOperationException("Cannot load " + file + " (Windows error " + Marshal.GetLastWin32Error() + ")");
                        }
                    }
                    loaded = true;
                }
            }
            return Utf8(Native.sqlite3_libversion(), -1);
        }

        public SqliteDb(string path)
        {
            Path = path;
            IntPtr db;
            int rc = Native.sqlite3_open_v2(Z(path), out db, 0x2 | 0x4, IntPtr.Zero);
            if (rc != SQLITE_OK)
            {
                string message = db != IntPtr.Zero ? Utf8(Native.sqlite3_errmsg(db), -1) : "cannot open " + path;
                if (db != IntPtr.Zero) Native.sqlite3_close_v2(db);
                throw new SqliteException(rc, message);
            }
            handle = db;
            Native.sqlite3_busy_timeout(handle, 10000);
        }

        public bool InTransaction
        {
            get { return Native.sqlite3_get_autocommit(Handle) == 0; }
        }

        // Several statements without parameters (schema, PRAGMA)
        public void Exec(string sql)
        {
            IntPtr error;
            int rc = Native.sqlite3_exec(Handle, Z(sql), IntPtr.Zero, IntPtr.Zero, out error);
            if (rc != SQLITE_OK)
            {
                string message = error != IntPtr.Zero ? Utf8(error, -1) : Utf8(Native.sqlite3_errmsg(handle), -1);
                if (error != IntPtr.Zero) Native.sqlite3_free(error);
                throw new SqliteException(rc, message);
            }
        }

        public void Begin() { Exec("BEGIN IMMEDIATE"); }
        public void Commit() { Exec("COMMIT"); }

        // Safe to call when the transaction is already closed
        public void Rollback()
        {
            if (handle != IntPtr.Zero && InTransaction) Exec("ROLLBACK");
        }

        public void Execute(string sql, IDictionary args)
        {
            Run(sql, args, null);
        }

        public List<Dictionary<string, object>> Query(string sql, IDictionary args)
        {
            List<Dictionary<string, object>> rows = new List<Dictionary<string, object>>();
            Run(sql, args, rows);
            return rows;
        }

        public Dictionary<string, object> Row(string sql, IDictionary args)
        {
            List<Dictionary<string, object>> rows = Query(sql, args);
            return rows.Count > 0 ? rows[0] : null;
        }

        public object Scalar(string sql, IDictionary args)
        {
            Dictionary<string, object> row = Row(sql, args);
            if (row == null) return null;
            foreach (KeyValuePair<string, object> pair in row) return pair.Value;
            return null;
        }

        public void Dispose()
        {
            if (handle != IntPtr.Zero)
            {
                Native.sqlite3_close_v2(handle);
                handle = IntPtr.Zero;
            }
        }

        private IntPtr Handle
        {
            get
            {
                if (handle == IntPtr.Zero) throw new ObjectDisposedException("SqliteDb");
                return handle;
            }
        }

        private void Run(string sql, IDictionary args, List<Dictionary<string, object>> rows)
        {
            IntPtr stmt;
            IntPtr tail;
            byte[] text = Z(sql);
            GCHandle pin = GCHandle.Alloc(text, GCHandleType.Pinned);
            int rc;
            int rest;
            try
            {
                IntPtr start = pin.AddrOfPinnedObject();
                rc = Native.sqlite3_prepare_v2(Handle, start, text.Length, out stmt, out tail);
                rest = tail == IntPtr.Zero ? 0 : (int)(tail.ToInt64() - start.ToInt64());
            }
            finally
            {
                pin.Free();
            }
            if (rc != SQLITE_OK) throw Error(rc);
            // A second statement would be silently skipped here; scripts go through Exec
            for (int i = rest; i < text.Length - 1; i++)
            {
                byte b = text[i];
                if (b != (byte)' ' && b != (byte)'\t' && b != (byte)'\r' && b != (byte)'\n' && b != (byte)';')
                {
                    Native.sqlite3_finalize(stmt);
                    throw new ArgumentException("Execute/Query run one SQL statement; use Exec for several");
                }
            }
            if (stmt == IntPtr.Zero) return;
            try
            {
                int count = Native.sqlite3_bind_parameter_count(stmt);
                for (int i = 1; i <= count; i++)
                {
                    string name = Utf8(Native.sqlite3_bind_parameter_name(stmt, i), -1);
                    if (string.IsNullOrEmpty(name)) throw new ArgumentException("Only named parameters (@name) are supported");
                    Bind(stmt, i, Lookup(args, name.Substring(1)));
                }
                while (true)
                {
                    rc = Native.sqlite3_step(stmt);
                    if (rc == SQLITE_DONE) break;
                    if (rc != SQLITE_ROW) throw Error(rc);
                    if (rows != null) rows.Add(ReadRow(stmt));
                }
                Changes = Native.sqlite3_changes(handle);
            }
            finally
            {
                Native.sqlite3_finalize(stmt);
            }
        }

        private static object Lookup(IDictionary args, string name)
        {
            if (args != null)
            {
                if (args.Contains(name)) return args[name];
                foreach (DictionaryEntry entry in args)
                {
                    if (string.Equals(Convert.ToString(entry.Key, CultureInfo.InvariantCulture), name, StringComparison.OrdinalIgnoreCase)) return entry.Value;
                }
            }
            throw new ArgumentException("Missing SQL parameter @" + name);
        }

        private void Bind(IntPtr stmt, int index, object value)
        {
            value = Unwrap(value);
            int rc;
            if (value == null || value is DBNull) rc = Native.sqlite3_bind_null(stmt, index);
            else if (value is string) { byte[] bytes = Encoding.UTF8.GetBytes((string)value); rc = Native.sqlite3_bind_text(stmt, index, bytes, bytes.Length, Transient); }
            else if (value is bool) rc = Native.sqlite3_bind_int64(stmt, index, (bool)value ? 1 : 0);
            else if (value is byte[])
            {
                byte[] blob = (byte[])value;
                rc = blob.Length == 0 ? Native.sqlite3_bind_zeroblob(stmt, index, 0) : Native.sqlite3_bind_blob(stmt, index, blob, blob.Length, Transient);
            }
            else if (value is int || value is long || value is short || value is byte || value is sbyte || value is uint || value is ushort || value is ulong)
                rc = Native.sqlite3_bind_int64(stmt, index, Convert.ToInt64(value, CultureInfo.InvariantCulture));
            else if (value is double || value is float || value is decimal)
                rc = Native.sqlite3_bind_double(stmt, index, Convert.ToDouble(value, CultureInfo.InvariantCulture));
            else { byte[] bytes = Encoding.UTF8.GetBytes(Convert.ToString(value, CultureInfo.InvariantCulture)); rc = Native.sqlite3_bind_text(stmt, index, bytes, bytes.Length, Transient); }
            if (rc != SQLITE_OK) throw Error(rc);
        }

        // PowerShell sometimes hands over values wrapped in PSObject
        private static object Unwrap(object value)
        {
            if (value == null) return null;
            Type type = value.GetType();
            if (type.FullName == "System.Management.Automation.PSObject")
            {
                object inner = type.GetProperty("BaseObject").GetValue(value, null);
                return inner == value ? value.ToString() : Unwrap(inner);
            }
            return value;
        }

        private static Dictionary<string, object> ReadRow(IntPtr stmt)
        {
            int count = Native.sqlite3_column_count(stmt);
            Dictionary<string, object> row = new Dictionary<string, object>(count, StringComparer.OrdinalIgnoreCase);
            for (int i = 0; i < count; i++)
            {
                string name = Utf8(Native.sqlite3_column_name(stmt, i), -1);
                object value;
                switch (Native.sqlite3_column_type(stmt, i))
                {
                    case 1: value = Native.sqlite3_column_int64(stmt, i); break;
                    case 2: value = Native.sqlite3_column_double(stmt, i); break;
                    case 3:
                        {
                            IntPtr p = Native.sqlite3_column_text(stmt, i);
                            value = Utf8(p, Native.sqlite3_column_bytes(stmt, i));
                            break;
                        }
                    case 4:
                        {
                            IntPtr p = Native.sqlite3_column_blob(stmt, i);
                            int n = Native.sqlite3_column_bytes(stmt, i);
                            byte[] blob = new byte[n];
                            if (n > 0) Marshal.Copy(p, blob, 0, n);
                            value = blob;
                            break;
                        }
                    default: value = null; break;
                }
                row[name] = value;
            }
            return row;
        }

        private SqliteException Error(int rc)
        {
            return new SqliteException(rc, Utf8(Native.sqlite3_errmsg(handle), -1));
        }

        private static byte[] Z(string s)
        {
            return Encoding.UTF8.GetBytes(s + "\0");
        }

        private static string Utf8(IntPtr p, int length)
        {
            if (p == IntPtr.Zero) return null;
            if (length < 0)
            {
                length = 0;
                while (Marshal.ReadByte(p, length) != 0) length++;
            }
            byte[] bytes = new byte[length];
            if (length > 0) Marshal.Copy(p, bytes, 0, length);
            return Encoding.UTF8.GetString(bytes);
        }
    }
}
