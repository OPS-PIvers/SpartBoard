// Measures and compares firestore.rules with the rules compiler inside the Firestore emulator jar.
// Run: java -cp <cloud-firestore-emulator.jar> RulesAst.java size <rules> | equiv <before> <after>
import com.google.firebase.rules.lang.FirebaseRulesProtoCompiler;
import com.google.firebase.rules.lang.common.FirebaseRulesLangOptions;
import com.google.firebase.rules.v1.Issue;
import com.google.firebase.rules.v1.Source;
import com.google.protobuf.Descriptors.FieldDescriptor;
import com.google.protobuf.Message;
import java.nio.file.Files;
import java.util.*;

public class RulesAst {
  static final FirebaseRulesProtoCompiler COMPILER = FirebaseRulesProtoCompiler.createStandalone(
      FirebaseRulesLangOptions.builder().allowTernaryOperator(true).build());

  static Message compile(String path) throws Exception {
    String text = Files.readString(java.nio.file.Path.of(path));
    var result = COMPILER.compile(Source.newBuilder().addFiles(
        com.google.firebase.rules.v1.File.newBuilder().setName("firestore.rules").setContent(text)));
    List<String> errors = new ArrayList<>();
    for (Issue i : result.getIssues())
      if (i.getSeverity() == Issue.Severity.ERROR)
        errors.add(path + ":" + i.getSourcePosition().getLine() + " " + i.getDescription());
    if (!errors.isEmpty()) { errors.forEach(System.err::println); System.exit(2); }
    return result.getRulesetAst();
  }

  static FieldDescriptor field(Message m, String name) { return m.getDescriptorForType().findFieldByName(name); }
  static Message get(Message m, String name) { var f = field(m, name); return f != null && m.hasField(f) ? (Message) m.getField(f) : null; }
  static String name(Message identifier) { return identifier == null ? null : (String) identifier.getField(field(identifier, "name")); }

  // Source positions are the only part of the AST that is not rule logic.
  static Message stripPositions(Message m) {
    Message.Builder b = m.toBuilder();
    for (FieldDescriptor f : m.getAllFields().keySet()) {
      if (f.getType() != FieldDescriptor.Type.MESSAGE) continue;
      if (f.getMessageType().getName().equals("SourcePosition")) { b.clearField(f); continue; }
      if (f.isRepeated()) for (int i = 0; i < m.getRepeatedFieldCount(f); i++) b.setRepeatedField(f, i, stripPositions((Message) m.getRepeatedField(f, i)));
      else b.setField(f, stripPositions((Message) m.getField(f)));
    }
    return b.build();
  }

  static Map<String, Message> helpers = new HashMap<>();
  static Map<String, List<String>> helperParams = new HashMap<>();

  // Inlines helper calls, substitutes params, and treats x['k'] as x.k.
  static Message rewrite(Message m, Map<String, Message> subst) {
    Message.Builder b = m.toBuilder();
    for (FieldDescriptor f : m.getAllFields().keySet()) {
      if (f.getType() != FieldDescriptor.Type.MESSAGE) continue;
      if (f.isRepeated()) for (int i = 0; i < m.getRepeatedFieldCount(f); i++) b.setRepeatedField(f, i, rewrite((Message) m.getRepeatedField(f, i), subst));
      else b.setField(f, rewrite((Message) m.getField(f), subst));
    }
    Message r = b.build();
    if (!r.getDescriptorForType().getName().equals("Expression")) return r;
    Message member = get(r, "member");
    if (member != null && get(member, "operand") == null && subst.containsKey(name(get(member, "id")))) return subst.get(name(get(member, "id")));
    Message call = get(r, "call");
    if (call == null) return r;
    String fn = name(get(call, "function_name"));
    @SuppressWarnings("unchecked") List<Message> args = (List<Message>) call.getField(field(call, "arguments"));
    if (get(call, "operand") == null && helpers.containsKey(fn) && args.size() == helperParams.get(fn).size()) {
      Map<String, Message> s = new HashMap<>();
      for (int i = 0; i < args.size(); i++) s.put(helperParams.get(fn).get(i), args.get(i));
      return rewrite(helpers.get(fn), s);
    }
    if (get(call, "operand") != null && "[]".equals(fn) && args.size() == 1) {
      Message lit = get(args.get(0), "literal");
      if (lit != null && lit.hasField(field(lit, "string_value"))) {
        Message.Builder mb = r.toBuilder();
        Message.Builder mem = mb.newBuilderForField(field(r, "member"));
        mem.setField(field(member == null ? (Message) mem.getDefaultInstanceForType() : member, "operand"), get(call, "operand"));
        Message.Builder id = mem.newBuilderForField(field(mem.getDefaultInstanceForType(), "id"));
        id.setField(field(id.getDefaultInstanceForType(), "name"), lit.getField(field(lit, "string_value")));
        mem.setField(field(mem.getDefaultInstanceForType(), "id"), id.build());
        return mb.clear().setField(field(r, "member"), mem.build()).build();
      }
    }
    return r;
  }

  static Message documentsRule(Message ast) {
    Message service = (Message) ast.getRepeatedField(field(ast, "service_rules"), 0);
    return (Message) service.getRepeatedField(field(service, "match_rules"), 0);
  }

  static int line(Message m) {
    Message sp = get(m, "source_position");
    if (sp != null) return ((Number) sp.getField(field(sp, "line"))).intValue();
    for (FieldDescriptor f : m.getAllFields().keySet())
      if (f.getType() == FieldDescriptor.Type.MESSAGE && !f.isRepeated()) { int l = line((Message) m.getField(f)); if (l > 0) return l; }
    return -1;
  }

  // Reports the first differing permission or function per match block, by line in <after>.
  static int report(Message before, Message after) {
    int diffs = 0;
    for (String kind : List.of("functions", "permissions", "match_rules")) {
      var fb = field(before, kind);
      int nb = before.getRepeatedFieldCount(fb), na = after.getRepeatedFieldCount(fb);
      if (nb != na) { System.err.println("count of " + kind + " differs near line " + line(after)); diffs++; continue; }
      for (int i = 0; i < nb; i++) {
        Message x = (Message) before.getRepeatedField(fb, i), y = (Message) after.getRepeatedField(fb, i);
        if (kind.equals("match_rules")) diffs += report(x, y);
        else if (!stripPositions(x).equals(stripPositions(y))) { System.err.println(kind + " differs at line " + line(y)); diffs++; }
      }
    }
    return diffs;
  }

  public static void main(String[] a) throws Exception {
    if (a[0].equals("size")) {
      System.out.println(stripPositions(compile(a[1])).getSerializedSize());
      return;
    }
    Message before = compile(a[1]), after = compile(a[2]);
    Set<String> existing = new HashSet<>();
    Message docsBefore = documentsRule(before);
    for (Object f : (List<?>) docsBefore.getField(field(docsBefore, "functions"))) existing.add(name(get((Message) f, "id")));
    Message docs = documentsRule(after);
    FieldDescriptor fnsField = field(docs, "functions");
    List<Message> kept = new ArrayList<>();
    for (Object o : (List<?>) docs.getField(fnsField)) {
      Message f = (Message) o;
      String n = name(get(f, "id"));
      if (existing.contains(n)) { kept.add(f); continue; }
      helpers.put(n, get(f, "body"));
      List<String> ps = new ArrayList<>();
      for (Object p : (List<?>) f.getField(field(f, "params_ids"))) ps.add(name((Message) p));
      helperParams.put(n, ps);
    }
    Message afterNoHelpers = after.toBuilder().build();
    Message.Builder docsB = docs.toBuilder().clearField(fnsField);
    for (Message f : kept) docsB.addRepeatedField(fnsField, f);
    Message service = (Message) after.getRepeatedField(field(after, "service_rules"), 0);
    Message.Builder serviceB = service.toBuilder();
    serviceB.setRepeatedField(field(service, "match_rules"), 0, docsB.build());
    afterNoHelpers = after.toBuilder().setRepeatedField(field(after, "service_rules"), 0, serviceB.build()).build();
    Message x = rewrite(before, Map.of()), y = rewrite(afterNoHelpers, Map.of());
    System.out.println("helpers inlined: " + new TreeSet<>(helpers.keySet()));
    if (stripPositions(x).equals(stripPositions(y))) { System.out.println("EQUIVALENT"); return; }
    int d = report(documentsRule(x), documentsRule(y));
    System.out.println("DIFFERENT (" + d + " sites)");
    System.exit(1);
  }
}
