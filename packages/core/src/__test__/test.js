class Foo {
  fields = {
    wibble: Bar
  }
}
class Bar {
  fields = {
    wibble: Foo
  }
}

console.log(new Foo(),new Bar())
