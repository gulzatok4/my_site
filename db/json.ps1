# JSON for Windows PowerShell 5.1 and PowerShell 7.
# 5.1 keeps JavaScriptSerializer. PowerShell 7 has no System.Web, so it uses System.Text.Json.
# Both paths return Dictionary / ArrayList, which the rest of the server already expects.
if ($PSVersionTable.PSVersion.Major -ge 6 -and -not ("Gulzat.Json.Portable" -as [type])) {
  try {
  Add-Type -ReferencedAssemblies @("System.Runtime", "System.Collections", "System.Memory", "System.Text.Json", "System.Text.Encodings.Web") -TypeDefinition @'
using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Reflection;
using System.Text.Encodings.Web;
using System.Text.Json;

namespace Gulzat.Json
{
    public static class Portable
    {
        private static readonly JsonSerializerOptions Options = new JsonSerializerOptions
        {
            Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
            MaxDepth = 64
        };

        public static object Parse(string text)
        {
            if (string.IsNullOrEmpty(text)) return null;
            var readerOptions = new JsonDocumentOptions { MaxDepth = 64 };
            using (JsonDocument doc = JsonDocument.Parse(text, readerOptions))
            {
                return Box(doc.RootElement);
            }
        }

        public static string Stringify(object value)
        {
            object native = Normalize(Unwrap(value), 0);
            if (native == null) return "null";
            return JsonSerializer.Serialize(native, native.GetType(), Options);
        }

        private static object Box(JsonElement el)
        {
            switch (el.ValueKind)
            {
                case JsonValueKind.Object:
                    var dict = new Dictionary<string, object>();
                    foreach (JsonProperty prop in el.EnumerateObject()) dict[prop.Name] = Box(prop.Value);
                    return dict;
                case JsonValueKind.Array:
                    var list = new ArrayList();
                    foreach (JsonElement item in el.EnumerateArray()) list.Add(Box(item));
                    return list;
                case JsonValueKind.String:
                    return el.GetString();
                case JsonValueKind.Number:
                    long whole;
                    if (el.TryGetInt64(out whole)) return whole;
                    return el.GetDouble();
                case JsonValueKind.True:
                    return true;
                case JsonValueKind.False:
                    return false;
                default:
                    return null;
            }
        }

        private static object Unwrap(object value)
        {
            if (value == null) return null;
            Type type = value.GetType();
            if (type.FullName != "System.Management.Automation.PSObject") return value;
            PropertyInfo baseProp = type.GetProperty("BaseObject");
            object inner = baseProp == null ? null : baseProp.GetValue(value, null);
            if (inner == null || object.ReferenceEquals(inner, value)) return value;
            if (inner.GetType().FullName == "System.Management.Automation.PSCustomObject") return value;
            return Unwrap(inner);
        }

        private static object Normalize(object value, int depth)
        {
            value = Unwrap(value);
            if (value == null || depth > 64) return null;
            if (value is string || value is bool || value is byte[] || value is decimal ||
                value is double || value is float || value is long || value is int ||
                value is short || value is byte || value is ulong || value is uint ||
                value is ushort || value is DateTime) return value;

            Type type = value.GetType();
            if (type.FullName == "System.Management.Automation.PSObject")
            {
                PropertyInfo propsProp = type.GetProperty("Properties");
                IEnumerable props = propsProp == null ? null : propsProp.GetValue(value, null) as IEnumerable;
                var copy = new Dictionary<string, object>();
                if (props != null)
                {
                    foreach (object prop in props)
                    {
                        Type propType = prop.GetType();
                        string name = (string)propType.GetProperty("Name").GetValue(prop, null);
                        object propValue = propType.GetProperty("Value").GetValue(prop, null);
                        copy[name] = Normalize(propValue, depth + 1);
                    }
                }
                return copy;
            }

            IDictionary dict = value as IDictionary;
            if (dict != null)
            {
                var copy = new Dictionary<string, object>();
                foreach (DictionaryEntry entry in dict)
                {
                    copy[Convert.ToString(entry.Key, CultureInfo.InvariantCulture)] = Normalize(entry.Value, depth + 1);
                }
                return copy;
            }

            IEnumerable list = value as IEnumerable;
            if (list != null)
            {
                var copy = new List<object>();
                foreach (object item in list) copy.Add(Normalize(item, depth + 1));
                return copy;
            }

            return Convert.ToString(value, CultureInfo.InvariantCulture);
        }
    }
}
'@
  } catch {
    if (-not ("Gulzat.Json.Portable" -as [type])) { throw }
  }
}

function ConvertFrom-JsonValue([string]$text) {
  if ([string]::IsNullOrEmpty($text)) { return $null }
  if ($PSVersionTable.PSVersion.Major -ge 6) {
    return [Gulzat.Json.Portable]::Parse($text)
  }
  Add-Type -AssemblyName System.Web.Extensions
  $ser = New-Object System.Web.Script.Serialization.JavaScriptSerializer
  $ser.MaxJsonLength = 67108864
  $ser.RecursionLimit = 64
  return $ser.DeserializeObject($text)
}

function ConvertTo-JsonValue($value) {
  if ($PSVersionTable.PSVersion.Major -ge 6) {
    # PowerShell разворачивает массив из одного элемента на границе с .NET, и список id стал бы строкой.
    if ($null -ne $value -and $value -is [System.Collections.IEnumerable] -and $value -isnot [string] -and $value -isnot [System.Collections.IDictionary] -and $value -isnot [System.Collections.ArrayList]) {
      $copy = New-Object System.Collections.ArrayList
      foreach ($item in $value) { [void]$copy.Add($item) }
      $value = $copy
    }
    return [Gulzat.Json.Portable]::Stringify($value)
  }
  Add-Type -AssemblyName System.Web.Extensions
  $ser = New-Object System.Web.Script.Serialization.JavaScriptSerializer
  $ser.MaxJsonLength = 67108864
  $ser.RecursionLimit = 64
  return $ser.Serialize($value)
}
